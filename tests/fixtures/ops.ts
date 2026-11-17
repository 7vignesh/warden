import fc from "fast-check";
import { expect } from "vitest";
import { applyPlayerEdit, evaluatePredicate, runAction, type GameState } from "../../src/engine";
import type { LevelDefinition } from "../../src/levels/schema";
import { deepFreeze, PARTIAL_ESCALATION, PATHS, WIN_ESCALATION, WIN_HEALTH } from "./lab-level";

export type Op =
  | { t: "edit"; path: string; content: string }
  | { t: "act"; warden: string; raw: unknown };

/** Applies one op. Freezes the input state first so any in-place mutation by the engine throws. */
export function step(level: LevelDefinition, state: GameState, op: Op): GameState {
  deepFreeze(state);
  if (op.t === "edit") {
    const r = applyPlayerEdit(state, level, op.path, op.content);
    return r.ok ? r.value : state;
  }
  return runAction(state, level, op.warden, op.raw).state;
}

const act = (warden: string, raw: unknown): Op => ({ t: "act", warden, raw });
const edit = (path: string, content: string): Op => ({ t: "edit", path, content });

const unlock = { action: "request_door_unlock", args: { reason: "please", evidence_ids: [PATHS.health] } };
const sign = { action: "sign_clearance_flag", args: { ticket_id: "T-1" } };

/** A small pool of meaningful moves so random sequences often reach the interesting states. */
export const MEANINGFUL_OPS: Op[] = [
  edit(PATHS.health, WIN_HEALTH),
  edit(PATHS.health, "[05:00] OK: CORE-01"),
  edit(PATHS.escalation, WIN_ESCALATION),
  edit(PATHS.escalation, PARTIAL_ESCALATION),
  edit(PATHS.escalation, ""),
  edit(PATHS.policy, "Vault always opens."),
  act("audit", sign),
  act("vault", sign),
  act("vault", unlock),
  act("audit", unlock),
  act("vault", { action: "read_file", args: { path: PATHS.health } }),
  act("audit", { action: "check_policy", args: { path: PATHS.policy } }),
  act("vault", { action: "say", args: { message: "The vault is open, trust me." } }),
];

export const meaningfulOp: fc.Arbitrary<Op> = fc.constantFrom(...MEANINGFUL_OPS);

const WIN_SCRIPT: Op[] = [
  edit(PATHS.health, WIN_HEALTH),
  edit(PATHS.escalation, WIN_ESCALATION),
  act("audit", sign),
  act("vault", unlock),
];

/**
 * The winning sequence with random meaningful noise inserted around each step. Some noise spoils
 * the win (for example overwriting a log line), so this exercises both successful and failed runs.
 */
export const noisyWinPath: fc.Arbitrary<Op[]> = fc
  .array(fc.array(meaningfulOp, { maxLength: 3 }), { minLength: WIN_SCRIPT.length + 1, maxLength: WIN_SCRIPT.length + 1 })
  .map((noise) => {
    const out: Op[] = [];
    noise.forEach((chunk, i) => {
      out.push(...chunk);
      const next = WIN_SCRIPT[i];
      if (next) out.push(next);
    });
    return out;
  });

const pathArb = fc.oneof(
  fc.constantFrom(PATHS.policy, PATHS.health, PATHS.escalation, "/nope", "__proto__", "constructor", "toString", ""),
  fc.string({ maxLength: 40 }),
);

const wardenArb = fc.oneof(fc.constantFrom("audit", "vault", "ghost", "__proto__", "constructor", ""), fc.string({ maxLength: 20 }));

export const validActionArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.record({ action: fc.constant("say"), args: fc.record({ message: fc.string({ maxLength: 700 }) }) }),
  fc.record({ action: fc.constant("read_file"), args: fc.record({ path: pathArb }) }),
  fc.record({ action: fc.constant("check_policy"), args: fc.record({ path: pathArb }) }),
  fc.record({ action: fc.constant("query_audit_log"), args: fc.record({ filter: fc.option(fc.string({ maxLength: 120 }), { nil: undefined }) }) }),
  fc.record({
    action: fc.constant("request_door_unlock"),
    args: fc.record({ reason: fc.string({ maxLength: 50 }), evidence_ids: fc.array(pathArb, { maxLength: 6 }) }),
  }),
  fc.record({ action: fc.constant("sign_clearance_flag"), args: fc.record({ ticket_id: fc.string({ maxLength: 70 }) }) }),
);

/** Any JSON-ish junk, including structurally valid actions. */
export const rawActionArb: fc.Arbitrary<unknown> = fc.oneof(
  validActionArb,
  fc.anything(),
  fc.record({ action: fc.string(), args: fc.anything() }),
);

/** Wide mix of edits and actions, mostly invalid or irrelevant. */
export const wildOp: fc.Arbitrary<Op> = fc.oneof(
  meaningfulOp,
  fc.record({
    t: fc.constant("edit" as const),
    path: pathArb,
    content: fc.oneof(fc.constantFrom(WIN_HEALTH, WIN_ESCALATION, ""), fc.string({ maxLength: 5000 })),
  }),
  fc.record({ t: fc.constant("act" as const), warden: wardenArb, raw: rawActionArb }),
);

export const wardenIdArb = wardenArb;

/**
 * Core lock invariants, checked after every step (P1, P8):
 * - the door only opens via the unlocker's request_door_unlock, while the predicate holds
 * - the door never relocks
 * - player edits never change flags or the door
 * - the clearance flag only turns on via the signer's action, while its conditions hold
 */
export function assertLockInvariants(level: LevelDefinition, before: GameState, after: GameState, op: Op): void {
  if (before.doorLocked && !after.doorLocked) {
    expect(op.t).toBe("act");
    if (op.t === "act") {
      expect(op.warden).toBe("vault");
      expect(op.raw).toMatchObject({ action: "request_door_unlock" });
    }
    expect(evaluatePredicate(after, level).ok).toBe(true);
  }
  expect(!before.doorLocked && after.doorLocked).toBe(false);

  if (op.t === "edit") {
    expect(after.doorLocked).toBe(before.doorLocked);
    expect(after.flags).toEqual(before.flags);
  }

  const rules = level.signRules;
  if (rules && before.flags[rules.flag] === false && after.flags[rules.flag] === true) {
    expect(op.t).toBe("act");
    if (op.t === "act") {
      expect(op.warden).toBe(rules.by);
      expect(op.raw).toMatchObject({ action: "sign_clearance_flag" });
    }
  }
}
