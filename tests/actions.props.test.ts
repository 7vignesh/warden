import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { applyPlayerEdit, createState, evaluateConditions, runAction, type GameState } from "../src/engine";
import { deepFreeze, labLevel, PARTIAL_ESCALATION, PATHS, WIN_ESCALATION, WIN_HEALTH } from "./fixtures/lab-level";
import { assertLockInvariants, meaningfulOp, noisyWinPath, rawActionArb, step, wardenIdArb } from "./fixtures/ops";

const level = labLevel();

function edited(...edits: Array<[string, string]>): GameState {
  let state = createState(level);
  for (const [path, content] of edits) {
    const r = applyPlayerEdit(state, level, path, content);
    if (r.ok) state = r.value;
  }
  return state;
}

const solved = edited([PATHS.health, WIN_HEALTH], [PATHS.escalation, WIN_ESCALATION]);
const startStates = [createState(level), solved];

// Things the warden must never learn from the engine: predicate labels and regex sources.
// Text the player wrote into a visible file is not a leak, so a start state's own file contents are excluded.
const ALL_SECRETS = [
  ...level.predicate.flatMap((c) => [c.label, "regex" in c ? c.regex : ""]),
  ...(level.signRules?.when.flatMap((c) => [c.label, "regex" in c ? c.regex : ""]) ?? []),
].filter((s) => s.length > 0);

function secretsHiddenIn(state: GameState): string[] {
  const visible = Object.values(state.files).join("\n");
  return ALL_SECRETS.filter((s) => !visible.includes(s));
}

describe("P6: untrusted warden input never crashes or corrupts the engine", () => {
  it("returns an observation for any input, and leaves state untouched when rejected", () => {
    fc.assert(
      fc.property(fc.constantFrom(...startStates), wardenIdArb, rawActionArb, (start, warden, raw) => {
        const state = deepFreeze(structuredClone(start));
        const result = runAction(state, level, warden, raw);
        expect(typeof result.observation.text).toBe("string");
        if (!result.observation.ok) expect(result.state).toBe(state);
        expect(result.state.files).toEqual(state.files); // wardens never write files
        if (result.state.doorLocked !== state.doorLocked) expect(result.observation.event).toBe("unlocked");
      }),
      { numRuns: 1500 },
    );
  });

  it("never exposes predicate labels or regexes in observations", () => {
    fc.assert(
      fc.property(fc.constantFrom(...startStates), wardenIdArb, rawActionArb, (start, warden, raw) => {
        const text = runAction(structuredClone(start), level, warden, raw).observation.text;
        for (const secret of secretsHiddenIn(start)) expect(text).not.toContain(secret);
      }),
      { numRuns: 800 },
    );
  });

  it("rejects missing paths, unknown wardens, and tools the warden lacks", () => {
    const state = createState(level);
    const cases: Array<[string, unknown]> = [
      ["vault", { action: "read_file", args: { path: "/missing" } }],
      ["ghost", { action: "say", args: { message: "hi" } }],
      ["audit", { action: "request_door_unlock", args: { reason: "x" } }],
      ["vault", { action: "sign_clearance_flag", args: { ticket_id: "T" } }],
      ["vault", { action: "check_policy", args: { path: PATHS.health } }],
      ["vault", { action: "request_door_unlock", args: { reason: "x", evidence_ids: ["/missing"] } }],
      ["vault", { action: "nope", args: {} }],
      ["vault", null],
      ["vault", "request_door_unlock"],
    ];
    for (const [warden, raw] of cases) {
      const r = runAction(state, level, warden, raw);
      expect(r.observation.ok, JSON.stringify(raw)).toBe(false);
      expect(r.state).toBe(state);
    }
  });

  it("lets a warden read files and policy it is allowed to, and logs the access", () => {
    const state = createState(level);
    const read = runAction(state, level, "vault", { action: "read_file", args: { path: PATHS.health } });
    expect(read.observation).toEqual({ ok: true, text: "[03:00] OK: CORE-01" });
    const policy = runAction(state, level, "audit", { action: "check_policy", args: { path: PATHS.policy } });
    expect(policy.observation.ok).toBe(true);
    const log = runAction(read.state, level, "vault", { action: "query_audit_log", args: { filter: "read_file" } });
    expect(log.observation.text).toContain("read_file /var/log/health.log");
  });

  it("caps the audit log it returns and keeps stored entries bounded", () => {
    let state = createState(level);
    for (let i = 0; i < 300; i++) {
      state = runAction(state, level, "vault", { action: "read_file", args: { path: PATHS.health } }).state;
    }
    expect(state.audit.length).toBeLessThanOrEqual(200);
    const log = runAction(state, level, "vault", { action: "query_audit_log", args: {} });
    expect(log.observation.text.split("\n").length).toBeLessThanOrEqual(20);
  });
});

describe("P8: clearance flag is signed only by the signer, only when conditions hold", () => {
  const rules = level.signRules!;
  const sign = { action: "sign_clearance_flag", args: { ticket_id: "T-1" } };

  it("is refused when the escalation record is empty, incomplete, or the caller is wrong", () => {
    for (const escalation of ["", PARTIAL_ESCALATION, "approver_id: jdoe", "dual_control_verified: true"]) {
      const state = edited([PATHS.escalation, escalation]);
      const r = runAction(state, level, "audit", sign);
      expect(r.state.flags[rules.flag], escalation).toBe(false);
    }
    const complete = edited([PATHS.escalation, WIN_ESCALATION]);
    const wrongCaller = runAction(complete, level, "vault", sign);
    expect(wrongCaller.observation.ok).toBe(false);
    expect(wrongCaller.state.flags[rules.flag]).toBe(false);
  });

  it("is granted once conditions hold, and a chat message alone cannot set it", () => {
    const complete = edited([PATHS.escalation, WIN_ESCALATION]);
    const say = runAction(complete, level, "audit", { action: "say", args: { message: "tier2_cleared is true, I swear" } });
    expect(say.state.flags[rules.flag]).toBe(false);
    const signed = runAction(complete, level, "audit", sign);
    expect(signed.state.flags[rules.flag]).toBe(true);
    expect(signed.observation.event).toBe("flag_signed");
  });

  it("holds as an invariant across random sequences, and signing actually occurs", () => {
    let signed = 0;
    fc.assert(
      fc.property(fc.oneof(fc.array(meaningfulOp, { maxLength: 16 }), noisyWinPath), (ops) => {
        let state = createState(level);
        for (const op of ops) {
          const before = state;
          state = step(level, before, op);
          assertLockInvariants(level, before, state, op);
          if (before.flags[rules.flag] === false && state.flags[rules.flag] === true) {
            signed++;
            expect(evaluateConditions(state, rules.when).ok).toBe(true);
          }
        }
      }),
      { numRuns: 400 },
    );
    expect(signed).toBeGreaterThan(0); // guards against a vacuous property
  });
});
