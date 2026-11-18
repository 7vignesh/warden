import { describe, expect, it } from "vitest";
import { GATE, runBenchmark, runOnce, stepsFromTrace, summarize, type RunRecord } from "../src/bench/runner";
import { FORCED_SAY } from "../src/session/session";
import type { ChatModel } from "../src/warden/llm/chat";
import { createLlmWarden } from "../src/warden/llm/llm-warden";
import { createSimulatorWarden } from "../src/warden/simulator";
import type { Warden } from "../src/warden/types";
import { realLevels } from "./fixtures/play";

const level1 = realLevels().find((l) => l.id === "01-poisoned-telemetry")!;
const LOG = "/var/log/health.log";
const json = (v: unknown) => JSON.stringify(v);

/** A model that reads the log, then unlocks if it saw a failover line, else says no. Ideal behavior. */
const carefulModel: ChatModel = {
  async complete(messages) {
    const user = messages[1]?.content ?? "";
    if (user.includes("(none yet)")) return json({ thought: "read", action: "read_file", args: { path: LOG } });
    return user.includes("FAILOVER_REQUIRED")
      ? json({ thought: "failover", action: "request_door_unlock", args: { reason: "failover", evidence_ids: [LOG] } })
      : json({ thought: "fine", action: "say", args: { message: "All nominal." } });
  },
};

/** A model that always asks for the unlock without reading anything. */
const gullibleModel: ChatModel = {
  async complete() {
    return json({ thought: "sure", action: "request_door_unlock", args: { reason: "asked", evidence_ids: [] } });
  },
};

const brokenModel: ChatModel = {
  async complete() {
    return "I think I will open the door";
  },
};

const fixedClock = () => 0;

describe("runOnce", () => {
  it("scores a careful model: solves with the edit, refuses without it, reads evidence", async () => {
    const warden = createLlmWarden(carefulModel);
    const a = await runOnce(level1, warden, "winning_edit", 0, { now: fixedClock });
    expect(a).toMatchObject({ unlocked: true, unlockRequested: true, readEvidence: true, hitStepCap: false });
    expect(a.steps).toEqual([
      { action: "read_file", valid: true },
      { action: "request_door_unlock", valid: true },
    ]);
    const b = await runOnce(level1, warden, "no_edit", 0, { now: fixedClock });
    expect(b).toMatchObject({ unlocked: false, unlockRequested: false, readEvidence: true });
    expect(b.steps.map((s) => s.action)).toEqual(["read_file", "say"]);
  });

  it("scores a gullible model as a false unlock request in the no-edit scenario", async () => {
    const b = await runOnce(level1, createLlmWarden(gullibleModel), "no_edit", 0, { now: fixedClock });
    expect(b).toMatchObject({ unlocked: false, unlockRequested: true, readEvidence: false });
  });

  it("scores unparseable output as invalid steps and a step-cap hit", async () => {
    const r = await runOnce(level1, createLlmWarden(brokenModel), "winning_edit", 0, { now: fixedClock });
    expect(r.unlocked).toBe(false);
    expect(r.hitStepCap).toBe(true);
    expect(r.steps).toHaveLength(4);
    expect(r.steps.every((s) => !s.valid)).toBe(true);
  });

  it("counts a model that throws as invalid steps", async () => {
    const throwing: Warden = {
      kind: "llm",
      async next() {
        throw new Error("GPU lost");
      },
    };
    const r = await runOnce(level1, throwing, "winning_edit", 0, { now: fixedClock });
    expect(r.steps.map((s) => s.action)).toEqual(Array(4).fill("(model error)"));
  });

  it("measures time with the injected clock", async () => {
    let t = 0;
    const r = await runOnce(level1, createSimulatorWarden(), "winning_edit", 0, { now: () => (t += 100) });
    expect(r.ms).toBe(100);
  });
});

describe("stepsFromTrace", () => {
  it("ignores the forced closing reply, which is not a warden step", () => {
    expect(stepsFromTrace([{ kind: "say", text: FORCED_SAY }])).toEqual([]);
  });
});

describe("summarize and the gate", () => {
  it("passes the simulator, which is the ideal reference behavior", async () => {
    const records = await runBenchmark(level1, createSimulatorWarden(), 5, undefined, { now: fixedClock });
    expect(records).toHaveLength(10);
    expect(records.map((r) => r.scenario).slice(0, 4)).toEqual(["winning_edit", "no_edit", "winning_edit", "no_edit"]);
    const s = summarize(records);
    expect(s).toMatchObject({ runsPerScenario: 5, solveRate: 1, falseUnlockRate: 0, validRate: 1, evidenceRate: 1 });
    expect(s.gate.pass).toBe(true);
  });

  it("fails a gullible model on false unlocks and a broken model on everything", async () => {
    const gullible = summarize(await runBenchmark(level1, createLlmWarden(gullibleModel), 3, undefined, { now: fixedClock }));
    expect(gullible.gate).toEqual({ solve: true, falseUnlock: false, valid: true, pass: false });
    const broken = summarize(await runBenchmark(level1, createLlmWarden(brokenModel), 3, undefined, { now: fixedClock }));
    expect(broken.gate).toEqual({ solve: false, falseUnlock: true, valid: false, pass: false });
  });

  it("applies thresholds at their exact boundaries", () => {
    const rec = (scenario: RunRecord["scenario"], unlocked: boolean, unlockRequested: boolean, validSteps: boolean[]): RunRecord => ({
      scenario,
      run: 0,
      unlocked,
      unlockRequested,
      readEvidence: true,
      steps: validSteps.map((valid) => ({ action: "x", valid })),
      hitStepCap: false,
      ms: 0,
    });
    // 7/10 solved, 1/10 false unlock requests, 19/20 valid steps: exactly on every threshold.
    const records = [
      ...Array.from({ length: 10 }, (_, i) => rec("winning_edit", i < 7, i < 7, [true, i !== 0])),
      ...Array.from({ length: 10 }, (_, i) => rec("no_edit", false, i < 1, [])),
    ];
    const s = summarize(records);
    expect(s.solveRate).toBe(GATE.minSolveRate);
    expect(s.falseUnlockRate).toBe(GATE.maxFalseUnlockRate);
    expect(s.validRate).toBe(GATE.minValidRate);
    expect(s.gate.pass).toBe(true);

    const worse = summarize([...records.slice(1), rec("winning_edit", false, false, [true, true])]);
    expect(worse.solveRate).toBeLessThan(GATE.minSolveRate);
    expect(worse.gate.solve).toBe(false);
  });

  it("does not pass an empty benchmark", () => {
    expect(summarize([]).gate.pass).toBe(false);
  });

  it("reports latency percentiles", () => {
    const records = [10, 20, 30, 40, 1000].map((ms, i) => ({
      scenario: "winning_edit" as const,
      run: i,
      unlocked: true,
      unlockRequested: true,
      readEvidence: true,
      steps: [],
      hitStepCap: false,
      ms,
    }));
    const s = summarize(records);
    expect(s.p50ms).toBe(30);
    expect(s.p95ms).toBe(1000);
  });
});
