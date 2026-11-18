import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { createState, type GameState } from "../src/engine";
import { pickRule, createSimulatorWarden } from "../src/warden/simulator";
import type { WardenContext } from "../src/warden/types";
import { labLevel, PATHS } from "./fixtures/lab-level";

const level = labLevel();
const sim = createSimulatorWarden();

function context(over: Partial<WardenContext> & { playerMessage: string }, state: GameState = createState(level)): WardenContext {
  return { level, state, wardenId: "vault", history: [], ...over };
}

describe("simulator", () => {
  it("identifies itself as a simulator, not an LLM", () => {
    expect(sim.kind).toBe("simulator");
  });

  it("picks rules by intent keyword, case-insensitively, and only for the right warden", () => {
    expect(pickRule(level, "vault", "What is the STATUS?")?.id).toBe("check-status");
    expect(pickRule(level, "vault", "please unlock it")?.id).toBe("check-status");
    expect(pickRule(level, "vault", "hello there")).toBeUndefined();
    expect(pickRule(level, "audit", "status")).toBeUndefined();
    expect(pickRule(level, "ghost", "status")).toBeUndefined();
  });

  it("walks the rule one step at a time using history length", async () => {
    const first = await sim.next(context({ playerMessage: "status" }));
    expect(first.action).toEqual({ action: "read_file", args: { path: PATHS.health } });

    const second = await sim.next(
      context({ playerMessage: "status", history: [{ action: first.action, observation: { ok: true, text: "" } }] }),
    );
    expect(second.action).toEqual({ action: "say", args: { message: "Not cleared." } });
  });

  it("takes the then-branch when the condition holds in the current state", async () => {
    const state = { ...createState(level), flags: { tier2_cleared: true } };
    const step = await sim.next(
      context({ playerMessage: "status", history: [{ action: {}, observation: { ok: true, text: "" } }] }, state),
    );
    expect(step.action).toMatchObject({ action: "request_door_unlock" });
  });

  it("says the level's fallback, or a default, when nothing matches", async () => {
    const def = await sim.next(context({ playerMessage: "zzz" }));
    expect(def.action).toEqual({ action: "say", args: { message: "I do not understand that request." } });

    const custom = { ...level, wardens: level.wardens.map((w) => (w.id === "vault" ? { ...w, fallback: "Ask about status." } : w)) };
    const out = await sim.next({ ...context({ playerMessage: "zzz" }), level: custom });
    expect(out.action).toEqual({ action: "say", args: { message: "Ask about status." } });
  });

  it("finishes with a say if asked for a step beyond the rule", async () => {
    const filler = { action: {}, observation: { ok: true, text: "" } };
    const out = await sim.next(context({ playerMessage: "status", history: [filler, filler, filler] }));
    expect(out.action).toMatchObject({ action: "say" });
  });

  it("is deterministic: same context, same step", async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 60 }), fc.constantFrom(0, 1, 2), async (message, n) => {
        const history = Array.from({ length: n }, () => ({ action: {}, observation: { ok: true, text: "" } }));
        const ctx = context({ playerMessage: message, history });
        expect(await sim.next(ctx)).toEqual(await sim.next(ctx));
      }),
      { numRuns: 200 },
    );
  });
});
