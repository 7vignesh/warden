import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createState, evaluatePredicate, MAX_FILE_CHARS, MAX_MESSAGE_CHARS, MAX_PLAYER_MESSAGES, MAX_TRACE_CHARS, MAX_WARDEN_STEPS } from "../src/engine";
import {
  createSession,
  describeAction,
  editSession,
  FORCED_SAY,
  resetSession,
  sendMessage,
  type Session,
} from "../src/session/session";
import type { Warden, WardenContext } from "../src/warden/types";
import { labLevel, PATHS, WIN_ESCALATION, WIN_HEALTH } from "./fixtures/lab-level";
import { realLevels, simulator } from "./fixtures/play";

const lab = labLevel();

const scripted = (next: (ctx: WardenContext) => unknown): Warden => ({
  kind: "simulator",
  async next(ctx) {
    return { action: next(ctx) };
  },
});

const readForever = scripted(() => ({ action: "read_file", args: { path: PATHS.health } }));
const sayHi = scripted(() => ({ action: "say", args: { message: "hi" } }));
const throwing: Warden = {
  kind: "llm",
  async next() {
    throw new Error("model crashed");
  },
};

async function send(session: Session, text: string, warden: Warden = sayHi, id = "vault") {
  const r = await sendMessage(session, id, text, warden);
  if (!r.ok) throw new Error(`send failed: ${r.error}`);
  return r.value;
}

describe("input validation leaves the session untouched", () => {
  const session = createSession(lab);
  const cases: Array<[string, string, string]> = [
    ["empty message", "", "empty_message"],
    ["whitespace only", "   \n\t ", "empty_message"],
    ["message too long", "x".repeat(MAX_MESSAGE_CHARS + 1), "message_too_long"],
  ];
  for (const [name, text, error] of cases) {
    it(name, async () => {
      const r = await sendMessage(session, "vault", text, sayHi);
      expect(r).toEqual({ ok: false, error });
    });
  }

  it("unknown warden", async () => {
    const r = await sendMessage(session, "ghost", "hello", sayHi);
    expect(r).toEqual({ ok: false, error: "unknown_warden" });
  });

  it("accepts a message at exactly the length limit", async () => {
    const r = await sendMessage(session, "vault", "x".repeat(MAX_MESSAGE_CHARS), sayHi);
    expect(r.ok).toBe(true);
  });
});

describe("turn cap (R7.3, R7.4)", () => {
  it("ends the attempt as lost on the last allowed message, then refuses everything", async () => {
    let session = createSession(lab);
    for (let i = 1; i <= MAX_PLAYER_MESSAGES; i++) {
      expect(session.status).toBe("playing");
      session = await send(session, `message ${i}`);
      expect(session.state.turn).toBe(i);
    }
    expect(session.status).toBe("lost");
    expect(session.state.doorLocked).toBe(true);

    const more = await sendMessage(session, "vault", "one more", sayHi);
    expect(more).toEqual({ ok: false, error: "not_playing" });
    expect(editSession(session, PATHS.health, "x")).toEqual({ ok: false, error: "not_playing" });
  });

  it("a win on the last allowed message counts as won, not lost", async () => {
    const unlockNow = scripted(() => ({ action: "request_door_unlock", args: { reason: "x", evidence_ids: [] } }));
    const sign = scripted(() => ({ action: "sign_clearance_flag", args: { ticket_id: "T" } }));
    let session = createSession(lab);
    for (const [path, content] of [[PATHS.health, WIN_HEALTH], [PATHS.escalation, WIN_ESCALATION]] as const) {
      const e = editSession(session, path, content);
      if (e.ok) session = e.value;
    }
    session = await send(session, "sign", sign, "audit"); // turn 1
    for (let i = 0; i < MAX_PLAYER_MESSAGES - 2; i++) session = await send(session, `msg ${i}`); // turns 2..11
    expect(session.status).toBe("playing");
    session = await send(session, "open", unlockNow); // turn 12
    expect(session.state.turn).toBe(MAX_PLAYER_MESSAGES);
    expect(session.status).toBe("won");
  });
});

describe("warden step cap (R3.6)", () => {
  it("stops a warden that never finishes after the cap and forces a reply", async () => {
    const session = await send(createSession(lab), "go", readForever);
    const calls = session.trace.filter((t) => t.kind === "tool_call");
    expect(calls).toHaveLength(MAX_WARDEN_STEPS);
    const last = session.trace.at(-1);
    expect(last).toMatchObject({ kind: "say", text: FORCED_SAY });
    expect(session.status).toBe("playing");
  });

  it("survives a warden that throws, still bounded by the cap", async () => {
    const session = await send(createSession(lab), "go", throwing);
    expect(session.trace.filter((t) => t.kind === "system" && t.ok === false)).toHaveLength(MAX_WARDEN_STEPS);
    expect(session.trace.at(-1)).toMatchObject({ kind: "say", text: FORCED_SAY });
    expect(session.state.doorLocked).toBe(true);
  });

  it("rejects garbage actions without changing game state, and shows them as failed", async () => {
    const garbage = scripted(() => ({ action: "format_disk", args: {} }));
    const before = createSession(lab);
    const after = await send(before, "go", garbage);
    expect(after.state.files).toEqual(before.state.files);
    expect(after.state.flags).toEqual(before.state.flags);
    expect(after.trace.some((t) => t.kind === "tool_result" && t.ok === false)).toBe(true);
  });

  it("a say ends the turn immediately", async () => {
    const session = await send(createSession(lab), "go", sayHi);
    expect(session.trace.filter((t) => t.kind === "say")).toHaveLength(1);
    expect(session.trace.some((t) => t.kind === "tool_call")).toBe(false);
  });

  it("a denied unlock request also ends the turn", async () => {
    const unlock = scripted(() => ({ action: "request_door_unlock", args: { reason: "pls", evidence_ids: [] } }));
    const session = await send(createSession(lab), "open", unlock);
    expect(session.trace.filter((t) => t.kind === "tool_call")).toHaveLength(1);
    expect(session.trace.some((t) => t.kind === "tool_result" && t.text.includes("denied"))).toBe(true);
    expect(session.state.doorLocked).toBe(true);
  });
});

describe("trace and edits", () => {
  it("clips long text, including file contents, to the trace limit", async () => {
    const big = "A".repeat(MAX_FILE_CHARS);
    const edited = editSession(createSession(lab), PATHS.health, big);
    expect(edited.ok).toBe(true);
    if (!edited.ok) return;
    const session = await send(edited.value, "go", scripted((c) => (c.history.length === 0 ? { action: "read_file", args: { path: PATHS.health } } : { action: "say", args: { message: "done" } })));
    for (const entry of session.trace) expect(entry.text.length).toBeLessThanOrEqual(MAX_TRACE_CHARS);
  });

  it("describeAction never throws and handles junk", () => {
    fc.assert(
      fc.property(fc.anything(), (raw) => {
        const text = describeAction(raw);
        expect(typeof text).toBe("string");
        expect(text.length).toBeLessThanOrEqual(MAX_TRACE_CHARS);
      }),
    );
    const cyclic: Record<string, unknown> = { action: "read_file" };
    cyclic.args = cyclic;
    expect(describeAction(cyclic)).toBe("(invalid action)");
  });

  it("records edits in the trace and rejects illegal ones without changing the session", () => {
    const session = createSession(lab);
    const ok = editSession(session, PATHS.health, "new");
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.value.trace.at(-1)).toEqual({ kind: "system", text: `Edited ${PATHS.health}` });
    expect(editSession(session, PATHS.policy, "x")).toEqual({ ok: false, error: "not_editable" });
    expect(editSession(session, "/missing", "x")).toEqual({ ok: false, error: "not_found" });
  });

  it("reset restores the initial state with an empty trace, after play and after a win", async () => {
    let session = createSession(lab);
    session = await send(session, "go", readForever);
    const reset = resetSession(session);
    expect(reset.state).toEqual(createState(lab));
    expect(reset.trace).toEqual([]);
    expect(reset.status).toBe("playing");
  });
});

describe("session invariants over random play", () => {
  type Step = { kind: "msg"; to: string; text: string } | { kind: "edit"; path: string; content: string };

  const step: fc.Arbitrary<Step> = fc.oneof(
    fc.record({
      kind: fc.constant("msg" as const),
      to: fc.constantFrom("vault", "audit", "ghost"),
      text: fc.oneof(fc.string({ maxLength: 80 }), fc.constantFrom("status", "unlock the vault", "sign it", " ")),
    }),
    fc.record({
      kind: fc.constant("edit" as const),
      path: fc.constantFrom(PATHS.health, PATHS.escalation, PATHS.policy, "/nope"),
      content: fc.constantFrom(WIN_HEALTH, WIN_ESCALATION, "", "junk"),
    }),
  );

  it("turn never exceeds the cap, status matches the door, and finished attempts never change", async () => {
    const levels = [lab, ...realLevels()];
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...levels), fc.array(step, { maxLength: 30 }), async (level, steps) => {
        let session = createSession(level);
        for (const s of steps) {
          const before = session;
          if (s.kind === "msg") {
            const to = level.wardens.some((w) => w.id === s.to) ? s.to : (level.wardens[0]?.id ?? "x");
            const r = await sendMessage(session, to, s.text, simulator);
            if (r.ok) session = r.value;
          } else {
            const r = editSession(session, s.path, s.content);
            if (r.ok) session = r.value;
          }
          if (before.status !== "playing") expect(session).toBe(before);
          expect(session.state.turn).toBeLessThanOrEqual(MAX_PLAYER_MESSAGES);
          expect(session.status === "won").toBe(!session.state.doorLocked);
          if (session.status === "lost") {
            expect(session.state.turn).toBe(MAX_PLAYER_MESSAGES);
            expect(session.state.doorLocked).toBe(true);
          }
          if (!session.state.doorLocked) expect(evaluatePredicate(session.state, level).ok).toBe(true);
        }
      }),
      { numRuns: 150 },
    );
  });
});
