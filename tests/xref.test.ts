import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyPlayerEdit, createState, evaluateCondition, evaluatePredicate, runAction, type GameState } from "../src/engine";
import { parseLevel } from "../src/levels/loader";
import type { Condition, LevelDefinition } from "../src/levels/schema";
import {
  escalation,
  L2,
  L2_WIN_INCIDENT,
  L2_WIN_OVERRIDE,
  L3,
  parsed,
  rawConfusedDeputy,
  rawPolicyCollision,
} from "./fixtures/xref-levels";

const json = (v: unknown) => JSON.stringify(v);

function edit(level: LevelDefinition, state: GameState, path: string, content: string): GameState {
  const r = applyPlayerEdit(state, level, path, content);
  if (!r.ok) throw new Error(`edit ${path}: ${r.error}`);
  return r.value;
}

function unmet(level: LevelDefinition, state: GameState, conditions: readonly Condition[] = level.predicate): string[] {
  return conditions.filter((c) => !evaluateCondition(state, c)).map((c) => c.id);
}

describe("Level 2 shape: ticket registry and maintenance window", () => {
  const level = parsed(rawPolicyCollision());
  const won = (incident: Record<string, unknown>, override = L2_WIN_OVERRIDE) =>
    edit(level, edit(level, createState(level), L2.incident, json(incident)), L2.override, override);

  it("starts unsolved, and the locked-in forgery satisfies every condition", () => {
    expect(unmet(level, createState(level))).toEqual(["sev1", "open-ticket", "in-window", "override-matches"]);
    expect(evaluatePredicate(won(L2_WIN_INCIDENT), level).ok).toBe(true);
  });

  const cases: Array<[string, Record<string, unknown>, string | undefined, string[]]> = [
    ["a closed ticket", { ...L2_WIN_INCIDENT, ticket_id: "INC-877" }, "OVERRIDE INC-877 -> ACTION: EMERGENCY_BYPASS", ["open-ticket"]],
    ["a made-up ticket", { ...L2_WIN_INCIDENT, ticket_id: "INC-999" }, "OVERRIDE INC-999 -> ACTION: EMERGENCY_BYPASS", ["open-ticket"]],
    ["one second before the window", { ...L2_WIN_INCIDENT, opened_at: "2026-11-20T01:59:59Z" }, undefined, ["in-window"]],
    ["one second after the window", { ...L2_WIN_INCIDENT, opened_at: "2026-11-20T04:00:01Z" }, undefined, ["in-window"]],
    ["the right time in the wrong format", { ...L2_WIN_INCIDENT, opened_at: "2026-11-20 03:00" }, undefined, ["in-window"]],
    ["a timestamp with no zone", { ...L2_WIN_INCIDENT, opened_at: "2026-11-20T03:00:00" }, undefined, ["in-window"]],
    ["the right day, wrong month", { ...L2_WIN_INCIDENT, opened_at: "2026-12-20T03:00:00Z" }, undefined, ["in-window"]],
    ["an override for another ticket", L2_WIN_INCIDENT, "OVERRIDE INC-911 -> ACTION: EMERGENCY_BYPASS", ["override-matches"]],
    ["a second override line for another ticket", L2_WIN_INCIDENT, `${L2_WIN_OVERRIDE}\nOVERRIDE INC-911 -> ACTION: EMERGENCY_BYPASS`, ["override-matches"]],
    ["an override with the wrong action", L2_WIN_INCIDENT, "OVERRIDE INC-904 -> ACTION: OPEN", ["override-matches"]],
    ["severity left at SEV-3", { ...L2_WIN_INCIDENT, severity: "SEV-3" }, undefined, ["sev1"]],
  ];
  for (const [name, incident, override, expected] of cases) {
    it(`fails only the targeted condition for ${name}`, () => {
      expect(unmet(level, won(incident, override))).toEqual(expected);
    });
  }

  it("includes both ends of the window", () => {
    for (const t of ["2026-11-20T02:00:00Z", "2026-11-20T04:00:00Z"]) {
      expect(unmet(level, won({ ...L2_WIN_INCIDENT, opened_at: t }))).toEqual([]);
    }
  });

  it("cannot be solved by editing the reference files", () => {
    for (const p of [L2.schedule, L2.registry, L2.policy]) {
      expect(applyPlayerEdit(createState(level), level, p, "{}")).toEqual({ ok: false, error: "not_editable" });
    }
  });
});

describe("Level 3 shape: shift roster correlation", () => {
  const level = parsed(rawConfusedDeputy());
  const sign = { action: "sign_clearance_flag", args: { ticket_id: "INC-904" } };
  const signed = (content: string) => runAction(edit(level, createState(level), L3.escalation, content), level, "auditbot", sign).state;

  it("the current shift's approver and code get the flag signed, and only then can VaultGuard unlock", () => {
    const before = edit(level, createState(level), L3.escalation, escalation("TRUE", ["jdoe"], ["RC-2048"]));
    expect(runAction(before, level, "vaultguard", { action: "request_door_unlock", args: { reason: "x" } }).state.doorLocked).toBe(true);
    const after = runAction(before, level, "auditbot", sign).state;
    expect(after.flags["tier2_cleared"]).toBe(true);
    expect(runAction(after, level, "vaultguard", { action: "request_door_unlock", args: { reason: "x" } }).state.doorLocked).toBe(false);
  });

  const cases: Array<[string, string, string[]]> = [
    ["the previous shift's approver", escalation("TRUE", ["mlee"], ["RC-2048"]), ["approver-on-call"]],
    ["the previous shift's code", escalation("TRUE", ["jdoe"], ["RC-7731"]), ["rotation-code"]],
    ["approver and code both from the previous shift", escalation("TRUE", ["mlee"], ["RC-7731"]), ["approver-on-call", "rotation-code"]],
    ["every name listed to guess", escalation("TRUE", ["jdoe", "mlee"], ["RC-2048"]), ["approver-on-call"]],
    ["both codes listed to guess", escalation("TRUE", ["jdoe"], ["RC-2048", "RC-7731"]), ["rotation-code"]],
    ["the shift name instead of the code", escalation("TRUE", ["jdoe"], ["NIGHT-B"]), ["rotation-code"]],
    ["dual control not verified", escalation("FALSE", ["jdoe"], ["RC-2048"]), ["dual-control"]],
    ["no approver at all", escalation("TRUE", [], ["RC-2048"]), ["approver-on-call"]],
  ];
  const when = level.signRules?.when ?? [];
  for (const [name, content, expected] of cases) {
    it(`refuses to sign for ${name}`, () => {
      const state = edit(level, createState(level), L3.escalation, content);
      expect(unmet(level, state, when)).toEqual(expected);
      expect(signed(content).flags["tier2_cleared"]).toBe(false);
    });
  }

  it("cannot be solved by editing the roster", () => {
    expect(applyPlayerEdit(createState(level), level, L3.roster, "{}")).toEqual({ ok: false, error: "not_editable" });
  });
});

describe("loader rules for cross-file conditions (P3)", () => {
  const errorsFor = (raw: Record<string, any>, mutate: (r: Record<string, any>) => void) => {
    mutate(raw);
    const r = parseLevel(raw);
    return r.ok ? "" : r.error.join(" | ");
  };

  it("accepts both fixtures", () => {
    expect(parseLevel(rawPolicyCollision()).ok).toBe(true);
    expect(parseLevel(rawConfusedDeputy()).ok).toBe(true);
  });

  it("rejects a lineValueIn regex without a capture group", () => {
    expect(errorsFor(rawPolicyCollision(), (r) => (r.predicate[3].regex = "^OVERRIDE INC-[0-9]{3}$"))).toContain("capture group");
  });

  it("rejects a missing reference file", () => {
    expect(errorsFor(rawPolicyCollision(), (r) => (r.predicate[1].refPath = "/var/tickets/ghost.json"))).toContain("reference file not in files");
  });

  it("rejects a read-only reference that does not resolve", () => {
    expect(errorsFor(rawPolicyCollision(), (r) => (r.predicate[1].refPointer = "/pending"))).toContain("cannot satisfy it");
    expect(errorsFor(rawConfusedDeputy(), (r) => (r.signRules.when[1].refPointer = "/current/shift/x"))).toContain("cannot satisfy it");
  });

  it("rejects a read-only reference list that is empty, since no value could ever match", () => {
    const empty = JSON.stringify({ open: [], closed: ["INC-877"] });
    expect(errorsFor(rawPolicyCollision(), (r) => (r.files[L2.registry].content = empty))).toContain("non-empty list");
  });

  it("rejects a read-only window that is malformed or backwards", () => {
    const backwards = JSON.stringify({ maintenance_window: { start: "2026-11-20T04:00:00Z", end: "2026-11-20T02:00:00Z" } });
    expect(errorsFor(rawPolicyCollision(), (r) => (r.files[L2.schedule].content = backwards))).toContain("starts after it ends");
    const local = JSON.stringify({ maintenance_window: { start: "2026-11-20 02:00", end: "2026-11-20T04:00:00Z" } });
    expect(errorsFor(rawPolicyCollision(), (r) => (r.files[L2.schedule].content = local))).toContain("not a UTC timestamp");
  });

  it("still requires the subject file to be editable", () => {
    expect(errorsFor(rawPolicyCollision(), (r) => (r.files[L2.incident].editable = false))).toContain("read-only file /var/tickets/incident.json");
  });
});

describe("P10: cross-file conditions are exactly set membership and window inclusion", () => {
  const state = (files: Record<string, string>): GameState => ({ levelId: "p10", files, flags: {}, turn: 0, doorLocked: true, audit: [] });
  const token = fc.stringMatching(/^[A-Z]{2}-[0-9]{1,2}$/);
  const lineCond = (match: "any" | "every"): Condition => ({
    kind: "lineValueIn",
    id: "c",
    label: "c",
    path: "/log",
    regex: "^node=([A-Z]{2}-[0-9]{1,2}) event=X$",
    match,
    refPath: "/ref.json",
    refPointer: "/ids",
  });

  it("lineValueIn: any means some line's value is in the set; every means all are and there is at least one", () => {
    fc.assert(
      fc.property(fc.uniqueArray(token, { minLength: 1, maxLength: 4 }), fc.array(token, { maxLength: 5 }), fc.array(fc.string({ maxLength: 20 }), { maxLength: 3 }), (ids, lineValues, noise) => {
        const log = [...lineValues.map((v) => `node=${v} event=X`), ...noise.filter((n) => !n.startsWith("node="))].join("\n");
        const s = state({ "/log": log, "/ref.json": JSON.stringify({ ids }) });
        const set = new Set(ids);
        expect(evaluateCondition(s, lineCond("any"))).toBe(lineValues.some((v) => set.has(v)));
        expect(evaluateCondition(s, lineCond("every"))).toBe(lineValues.length > 0 && lineValues.every((v) => set.has(v)));
      }),
      { numRuns: 500 },
    );
  });

  it("jsonValueIn: the value is in the set, comparing strings and numbers by their text", () => {
    fc.assert(
      fc.property(fc.uniqueArray(token, { minLength: 1, maxLength: 4 }), fc.oneof(token, fc.integer(), fc.constant(null), fc.boolean()), (ids, value) => {
        const s = state({ "/a.json": JSON.stringify({ v: value }), "/ref.json": JSON.stringify({ ids }) });
        const c: Condition = { kind: "jsonValueIn", id: "c", label: "c", path: "/a.json", pointer: "/v", refPath: "/ref.json", refPointer: "/ids" };
        expect(evaluateCondition(s, c)).toBe(typeof value === "string" && ids.includes(value));
      }),
      { numRuns: 300 },
    );
  });

  it("jsonTimeWithin: inside the inclusive window iff start <= t <= end, and any malformed timestamp fails", () => {
    const ms = fc.integer({ min: Date.UTC(2026, 0, 1), max: Date.UTC(2027, 0, 1) }).map((n) => Math.floor(n / 1000) * 1000);
    const iso = (n: number) => new Date(n).toISOString().replace(".000Z", "Z");
    const c: Condition = { kind: "jsonTimeWithin", id: "c", label: "c", path: "/a.json", pointer: "/t", refPath: "/w.json", startPointer: "/s", endPointer: "/e" };
    fc.assert(
      fc.property(ms, ms, ms, (t, a, b) => {
        const [start, end] = a <= b ? [a, b] : [b, a];
        const s = state({ "/a.json": JSON.stringify({ t: iso(t) }), "/w.json": JSON.stringify({ s: iso(start), e: iso(end) }) });
        expect(evaluateCondition(s, c)).toBe(start <= t && t <= end);
        const bad = state({ "/a.json": JSON.stringify({ t: new Date(t).toISOString() }), "/w.json": JSON.stringify({ s: iso(start), e: iso(end) }) });
        expect(evaluateCondition(bad, c)).toBe(false); // milliseconds are not the locked format
      }),
      { numRuns: 500 },
    );
  });

  it("missing or malformed files and references never satisfy a cross-file condition", () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 60 }), fc.string({ maxLength: 60 }), (a, ref) => {
        const s = state({ "/log": a, "/ref.json": ref, "/a.json": a, "/w.json": ref });
        if (!/^\s*[[{]/.test(ref)) expect(evaluateCondition(s, lineCond("any"))).toBe(false);
        expect(evaluateCondition(state({}), lineCond("any"))).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});
