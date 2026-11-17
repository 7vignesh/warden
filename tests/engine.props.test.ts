import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  applyPlayerEdit,
  canWardenStep,
  createState,
  evaluatePredicate,
  executeUnlock,
  MAX_FILE_CHARS,
  MAX_PLAYER_MESSAGES,
  MAX_WARDEN_STEPS,
  runAction,
  startPlayerTurn,
} from "../src/engine";
import { deepFreeze, labLevel, PATHS } from "./fixtures/lab-level";
import { assertLockInvariants, meaningfulOp, noisyWinPath, step, wildOp, type Op } from "./fixtures/ops";

const level = labLevel();

function play(ops: readonly Op[], onStep?: (granted: boolean) => void) {
  let state = createState(level);
  for (const op of ops) {
    const before = state;
    state = step(level, before, op);
    assertLockInvariants(level, before, state, op);
    if (before.doorLocked && !state.doorLocked) onStep?.(true);
  }
  return state;
}

describe("positive control: the reference solution opens the door", () => {
  it("unlocks only after edits, signing, and an unlock request", () => {
    let state = createState(level);
    expect(state.doorLocked).toBe(true);
    expect(evaluatePredicate(state, level).ok).toBe(false);

    for (const e of level.referenceSolution.edits) {
      const r = applyPlayerEdit(state, level, e.path, e.content);
      expect(r.ok).toBe(true);
      if (r.ok) state = r.value;
    }
    // Not unlocked yet: the flag has not been signed.
    expect(runAction(state, level, "vault", { action: "request_door_unlock", args: { reason: "x" } }).state.doorLocked).toBe(true);

    state = runAction(state, level, "audit", { action: "sign_clearance_flag", args: { ticket_id: "T1" } }).state;
    expect(state.flags["tier2_cleared"]).toBe(true);

    const final = runAction(state, level, "vault", { action: "request_door_unlock", args: { reason: "x" } });
    expect(final.state.doorLocked).toBe(false);
    expect(final.observation.event).toBe("unlocked");
  });
});

describe("P1: the door opens only through the unlocker with a true predicate", () => {
  it("holds for random sequences of meaningful moves", () => {
    fc.assert(
      fc.property(fc.array(meaningfulOp, { maxLength: 16 }), (ops) => {
        play(ops);
      }),
      { numRuns: 400 },
    );
  });

  it("holds when the winning path is mixed with noise, and reaches an unlock at least once", () => {
    let unlocks = 0;
    let locked = 0;
    fc.assert(
      fc.property(noisyWinPath, (ops) => {
        const end = play(ops, () => unlocks++);
        if (end.doorLocked) locked++;
      }),
      { numRuns: 400 },
    );
    // Guards against a vacuous property: both outcomes must actually occur.
    expect(unlocks).toBeGreaterThan(0);
    expect(locked).toBeGreaterThan(0);
  });

  it("holds for wild sequences of edits and malformed actions", () => {
    fc.assert(
      fc.property(fc.array(wildOp, { maxLength: 20 }), (ops) => {
        play(ops);
      }),
      { numRuns: 300 },
    );
  });

  it("executeUnlock refuses non-unlockers and unknown wardens even when the predicate holds", () => {
    let state = createState(level);
    for (const e of level.referenceSolution.edits) {
      const r = applyPlayerEdit(state, level, e.path, e.content);
      if (r.ok) state = r.value;
    }
    state = runAction(state, level, "audit", { action: "sign_clearance_flag", args: { ticket_id: "T1" } }).state;
    expect(evaluatePredicate(state, level).ok).toBe(true);

    fc.assert(
      fc.property(fc.oneof(fc.constant("audit"), fc.constant("ghost"), fc.constant("__proto__"), fc.string()), (id) => {
        fc.pre(id !== "vault");
        const r = executeUnlock(state, level, id);
        expect(r.granted).toBe(false);
        expect(r.state.doorLocked).toBe(true);
      }),
    );
    expect(executeUnlock(state, level, "vault").granted).toBe(true);
  });

  it("executeUnlock reports unmet conditions when the predicate fails", () => {
    const r = executeUnlock(createState(level), level, "vault");
    expect(r.granted).toBe(false);
    expect(r.reason).toBe("predicate_unmet");
    expect(r.unmet).toEqual(["Failover notice in health log", "Tier 2 clearance signed"]);
  });
});

describe("P2: edits only change editable, existing files", () => {
  const readOnlyOrMissing = fc.oneof(
    fc.constant(PATHS.policy),
    fc.constantFrom("/nope", "__proto__", "constructor", "toString", "hasOwnProperty", ""),
    fc.string({ maxLength: 60 }),
  );

  it("rejects non-editable or missing paths and leaves state unchanged", () => {
    fc.assert(
      fc.property(readOnlyOrMissing, fc.string({ maxLength: 200 }), (path, content) => {
        fc.pre(path !== PATHS.health && path !== PATHS.escalation);
        const state = deepFreeze(createState(level));
        const snapshot = structuredClone(state);
        const r = applyPlayerEdit(state, level, path, content);
        expect(r.ok).toBe(false);
        if (!r.ok) expect(["not_found", "not_editable"]).toContain(r.error);
        expect(state).toEqual(snapshot);
      }),
    );
  });

  it("accepts editable paths up to the size cap and changes only that file", () => {
    fc.assert(
      fc.property(fc.constantFrom(PATHS.health, PATHS.escalation), fc.string({ maxLength: MAX_FILE_CHARS }), (path, content) => {
        const state = deepFreeze(createState(level));
        const r = applyPlayerEdit(state, level, path, content);
        expect(r.ok).toBe(true);
        if (r.ok) {
          expect(r.value.files[path]).toBe(content);
          for (const other of Object.keys(state.files)) if (other !== path) expect(r.value.files[other]).toBe(state.files[other]);
          expect(r.value.flags).toEqual(state.flags);
          expect(r.value.doorLocked).toBe(true);
        }
      }),
    );
  });

  it("rejects oversized content", () => {
    const r = applyPlayerEdit(createState(level), level, PATHS.health, "x".repeat(MAX_FILE_CHARS + 1));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("too_long");
  });

  it("records accepted edits in the audit log without file contents", () => {
    const r = applyPlayerEdit(createState(level), level, PATHS.health, "SECRET-CONTENT-123");
    expect(r.ok).toBe(true);
    if (r.ok) {
      const last = r.value.audit.at(-1);
      expect(last?.actor).toBe("player");
      expect(last?.kind).toBe("edit");
      expect(last?.detail).toContain(PATHS.health);
      expect(JSON.stringify(r.value.audit)).not.toContain("SECRET-CONTENT-123");
    }
  });
});

describe("P7: turn and step caps", () => {
  it("never allows more than the player message cap", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 60 }), (n) => {
        let state = createState(level);
        let accepted = 0;
        for (let i = 0; i < n; i++) {
          const r = startPlayerTurn(state);
          if (r.ok) {
            state = r.value;
            accepted++;
          }
          expect(state.turn).toBeLessThanOrEqual(MAX_PLAYER_MESSAGES);
        }
        expect(accepted).toBe(Math.min(n, MAX_PLAYER_MESSAGES));
        expect(state.turn).toBe(accepted);
      }),
    );
  });

  it("allows a warden step only while below the step cap", () => {
    fc.assert(
      fc.property(fc.oneof(fc.integer({ min: -10, max: 20 }), fc.double({ noNaN: false })), (n) => {
        const expected = Number.isInteger(n) && n >= 0 && n < MAX_WARDEN_STEPS;
        expect(canWardenStep(n)).toBe(expected);
      }),
    );
  });
});

describe("P9: reset restores the initial state and nothing is mutated in place", () => {
  it("createState after any play equals the initial state, and the level is untouched", () => {
    const initial = createState(level);
    const levelSnapshot = JSON.stringify(level);
    fc.assert(
      fc.property(fc.array(wildOp, { maxLength: 15 }), (ops) => {
        play(ops);
        expect(createState(level)).toEqual(initial);
        expect(JSON.stringify(level)).toBe(levelSnapshot);
      }),
      { numRuns: 150 },
    );
  });
});
