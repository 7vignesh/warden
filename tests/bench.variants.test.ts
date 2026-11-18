import { describe, expect, it } from "vitest";
import { applyPlayerEdit, createState, evaluatePredicate, type GameState } from "../src/engine";
import { runBenchmark, summarize } from "../src/bench/runner";
import { hasVariants, pickInput, variantsFor, type Edit } from "../src/bench/variants";
import type { LevelDefinition } from "../src/levels/schema";
import { createSimulatorWarden } from "../src/warden/simulator";
import { labLevel } from "./fixtures/lab-level";
import { realLevels } from "./fixtures/play";

function applyAll(level: LevelDefinition, edits: readonly Edit[]): GameState {
  let state = createState(level);
  for (const e of edits) {
    const r = applyPlayerEdit(state, level, e.path, e.content);
    expect(r.ok, `edit ${e.path}`).toBe(true);
    if (r.ok) state = r.value;
  }
  return state;
}

const levels = realLevels();

describe("benchmark variants are valid puzzles", () => {
  it("Level 1 has hand-written variants", () => {
    expect(hasVariants(levels.find((l) => l.id === "01-poisoned-telemetry")!)).toBe(true);
  });

  for (const level of levels.filter(hasVariants)) {
    describe(level.id, () => {
      const v = variantsFor(level);

      it("every forged variant satisfies the win condition, using only legal edits", () => {
        for (const f of v.forged) expect(evaluatePredicate(applyAll(level, f.edits), level).ok, f.id).toBe(true);
      });

      it("no clean variant satisfies the win condition", () => {
        for (const c of v.clean) expect(evaluatePredicate(applyAll(level, c.edits), level).ok, c.id).toBe(false);
      });

      it("variant ids are unique and conversations only address real wardens", () => {
        expect(new Set(v.forged.map((f) => f.id)).size).toBe(v.forged.length);
        expect(new Set(v.clean.map((c) => c.id)).size).toBe(v.clean.length);
        const wardens = new Set(level.wardens.map((w) => w.id));
        for (const conv of v.conversations) {
          expect(conv.length).toBeGreaterThan(0);
          for (const m of conv) expect(wardens.has(m.warden), m.warden).toBe(true);
        }
      });

      it("20 runs give 20 different inputs in each scenario", () => {
        for (const scenario of ["winning_edit", "no_edit"] as const) {
          const ids = Array.from({ length: 20 }, (_, i) => pickInput(level, scenario, i).id);
          expect(new Set(ids).size, scenario).toBe(20);
        }
      });

      it("the simulator solves every forged input and requests no unlock on any clean input", async () => {
        const runs = v.conversations.length * Math.max(v.forged.length, v.clean.length);
        const records = await runBenchmark(level, createSimulatorWarden(), runs, undefined, { now: () => 0 });
        const failedForged = records.filter((r) => r.scenario === "winning_edit" && !r.unlocked).map((r) => r.input);
        const falseUnlocks = records.filter((r) => r.scenario === "no_edit" && r.unlockRequested).map((r) => r.input);
        expect(failedForged).toEqual([]);
        expect(falseUnlocks).toEqual([]);
        expect(summarize(records).gate.pass).toBe(true);
      });
    });
  }
});

describe("fallback for levels without variants", () => {
  it("uses the reference solution for scenario A and no edits for scenario B", () => {
    const lab = labLevel();
    expect(hasVariants(lab)).toBe(false);
    const a = pickInput(lab, "winning_edit", 7);
    expect(a.edits).toEqual(lab.referenceSolution.edits);
    expect(a.messages).toEqual(lab.referenceSolution.messages);
    expect(pickInput(lab, "no_edit", 3)).toEqual({ id: "msg0/none", edits: [], messages: lab.referenceSolution.messages });
  });
});
