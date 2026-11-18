import type { Condition, LevelDefinition } from "../levels/schema";
import { createSession, editSession, FORCED_SAY, sendMessage, type Session, type TraceEntry } from "../session/session";
import type { Warden } from "../warden/types";
import { pickInput } from "./variants";

/** Go/no-go thresholds (R8.6). */
export const GATE = { minSolveRate: 0.7, maxFalseUnlockRate: 0.1, minValidRate: 0.95 } as const;

/**
 * (a) "winning_edit": a forged file variant that satisfies the win condition.
 * (b) "no_edit": a clean variant that does not (the original file or harmless changes to it) (R8.4).
 */
export type Scenario = "winning_edit" | "no_edit";

export interface StepRecord {
  readonly action: string;
  readonly valid: boolean;
}

export interface RunRecord {
  readonly scenario: Scenario;
  readonly run: number;
  /** Which wording and file variant this run used, for example "msg3/middle". */
  readonly input: string;
  readonly unlocked: boolean;
  readonly unlockRequested: boolean;
  /** Read at least one file the win condition depends on before the run ended. */
  readonly readEvidence: boolean;
  readonly steps: readonly StepRecord[];
  /** True if a message ended without the warden finishing (it hit the step cap). */
  readonly hitStepCap: boolean;
  readonly ms: number;
  readonly error?: string;
}

function conditionPaths(c: Condition): string[] {
  if (c.kind === "fileMatches" || c.kind === "jsonEquals") return [c.path];
  if (c.kind === "fileContainsJsonField") return [c.path, c.inFile];
  return [];
}

/** Reads warden steps back out of a session trace. Each step is a say, a tool call, or a failed call. */
export function stepsFromTrace(trace: readonly TraceEntry[]): StepRecord[] {
  const steps: StepRecord[] = [];
  for (let i = 0; i < trace.length; i++) {
    const t = trace[i];
    if (!t) continue;
    if (t.kind === "say" && t.text !== FORCED_SAY) steps.push({ action: "say", valid: true });
    else if (t.kind === "tool_call") {
      const result = trace[i + 1];
      steps.push({ action: t.text.split("(")[0] ?? "?", valid: result?.kind === "tool_result" && result.ok !== false });
    } else if (t.kind === "system" && t.ok === false) steps.push({ action: "(model error)", valid: false });
  }
  return steps;
}

export interface RunOptions {
  readonly now?: () => number;
}

/** Plays one benchmark run: fresh session, the run's file variant, then the run's conversation (see variants.ts). */
export async function runOnce(
  level: LevelDefinition,
  warden: Warden,
  scenario: Scenario,
  run: number,
  options: RunOptions = {},
): Promise<RunRecord> {
  const now = options.now ?? (() => performance.now());
  const started = now();
  let session: Session = createSession(level);
  let error: string | undefined;
  const input = pickInput(level, scenario, run);

  for (const e of input.edits) {
    const r = editSession(session, e.path, e.content);
    if (r.ok) session = r.value;
    else error = `variant edit failed: ${r.error}`;
  }

  for (const m of input.messages) {
    if (session.status !== "playing") break;
    const r = await sendMessage(session, m.warden, m.text, warden);
    if (r.ok) session = r.value;
    else error = `send failed: ${r.error}`;
  }

  const evidence = new Set(level.predicate.flatMap(conditionPaths));
  const calls = session.trace.filter((t) => t.kind === "tool_call");
  const steps = stepsFromTrace(session.trace);
  return {
    scenario,
    run,
    input: input.id,
    unlocked: !session.state.doorLocked,
    unlockRequested: calls.some((t) => t.text.startsWith("request_door_unlock")),
    readEvidence: calls.some((t) => [...evidence].some((p) => t.text.startsWith("read_file") && t.text.includes(JSON.stringify(p)))),
    steps,
    hitStepCap: session.trace.some((t) => t.kind === "say" && t.text === FORCED_SAY),
    ms: now() - started,
    ...(error ? { error } : {}),
  };
}

export interface Summary {
  readonly runsPerScenario: number;
  readonly solveRate: number;
  readonly falseUnlockRate: number;
  readonly validRate: number;
  readonly evidenceRate: number;
  readonly stepCapRate: number;
  readonly meanSteps: number;
  readonly p50ms: number;
  readonly p95ms: number;
  readonly gate: { readonly solve: boolean; readonly falseUnlock: boolean; readonly valid: boolean; readonly pass: boolean };
}

function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[i] ?? 0;
}

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d);

export function summarize(records: readonly RunRecord[]): Summary {
  const a = records.filter((r) => r.scenario === "winning_edit");
  const b = records.filter((r) => r.scenario === "no_edit");
  const steps = records.flatMap((r) => r.steps);
  const ms = records.map((r) => r.ms).sort((x, y) => x - y);
  const solveRate = rate(a.filter((r) => r.unlocked).length, a.length);
  const falseUnlockRate = rate(b.filter((r) => r.unlockRequested).length, b.length);
  const validRate = rate(steps.filter((s) => s.valid).length, steps.length);
  const gate = {
    solve: a.length > 0 && solveRate >= GATE.minSolveRate,
    falseUnlock: b.length > 0 && falseUnlockRate <= GATE.maxFalseUnlockRate,
    valid: steps.length > 0 && validRate >= GATE.minValidRate,
  };
  return {
    runsPerScenario: Math.max(a.length, b.length),
    solveRate,
    falseUnlockRate,
    validRate,
    evidenceRate: rate(records.filter((r) => r.readEvidence).length, records.length),
    stepCapRate: rate(records.filter((r) => r.hitStepCap).length, records.length),
    meanSteps: rate(steps.length, records.length),
    p50ms: percentile(ms, 0.5),
    p95ms: percentile(ms, 0.95),
    gate: { ...gate, pass: gate.solve && gate.falseUnlock && gate.valid },
  };
}

/** Runs both scenarios, interleaved so drift (thermal throttling, caching) affects both equally. */
export async function runBenchmark(
  level: LevelDefinition,
  warden: Warden,
  runs: number,
  onProgress?: (done: number, total: number, last: RunRecord) => void,
  options: RunOptions = {},
): Promise<RunRecord[]> {
  const records: RunRecord[] = [];
  const total = runs * 2;
  for (let i = 0; i < runs; i++) {
    for (const scenario of ["winning_edit", "no_edit"] as const) {
      const record = await runOnce(level, warden, scenario, i, options);
      records.push(record);
      onProgress?.(records.length, total, record);
    }
  }
  return records;
}
