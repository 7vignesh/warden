import { useEffect, useRef, useState } from "react";
import { loadAllLevels } from "../levels/registry";
import { LocalModel, type LoadStatus } from "../warden/llm/client";
import { createLlmWarden } from "../warden/llm/llm-warden";
import { CANDIDATE_MODELS, WEBLLM_VERSION } from "../warden/llm/models";
import { GATE, runBenchmark, summarize, type RunRecord, type Summary } from "./runner";

export interface BenchResult {
  readonly meta: {
    readonly modelId: string;
    readonly webllmVersion: string;
    readonly levelId: string;
    readonly runsPerScenario: number;
    readonly startedAt: string;
    readonly loadMs: number;
    readonly benchMs: number;
    readonly userAgent: string;
    readonly gpu: string;
    readonly gate: typeof GATE;
    readonly promptSample: unknown;
  };
  readonly summary: Summary;
  readonly records: readonly RunRecord[];
  readonly outputs: readonly { readonly raw: string; readonly parsed: boolean; readonly ms: number }[];
}

declare global {
  interface Window {
    __benchResult?: BenchResult;
    __benchError?: string;
    __benchProgress?: { done: number; total: number; load?: LoadStatus };
  }
}

const params = new URLSearchParams(location.search);
const clampRuns = (n: number) => (Number.isFinite(n) ? Math.min(100, Math.max(1, Math.round(n))) : 20);

async function gpuName(): Promise<string> {
  try {
    const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ info?: { vendor?: string; architecture?: string } } | null> } }).gpu;
    const adapter = await gpu?.requestAdapter();
    return adapter?.info ? `${adapter.info.vendor ?? "?"} ${adapter.info.architecture ?? ""}`.trim() : "unknown";
  } catch {
    return "unknown";
  }
}

const pct = (x: number) => `${(x * 100).toFixed(0)}%`;

/** Benchmark page (R8). Open with ?bench. Automation: ?bench&model=<id>&runs=<n>&auto */
export function BenchPage() {
  const levels = loadAllLevels().levels;
  const [modelId, setModelId] = useState(params.get("model") ?? CANDIDATE_MODELS[0]?.id ?? "");
  const [levelId, setLevelId] = useState(params.get("level") ?? levels[0]?.id ?? "");
  const [runs, setRuns] = useState(clampRuns(Number(params.get("runs") ?? 20)));
  const [load, setLoad] = useState<LoadStatus>({ kind: "idle" });
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const modelRef = useRef<LocalModel | null>(null);
  const started = useRef(false);

  async function run() {
    const level = levels.find((l) => l.id === levelId);
    if (!level || running) return;
    setRunning(true);
    setResult(null);
    setError(null);
    window.__benchResult = undefined;
    window.__benchError = undefined;
    try {
      if (modelRef.current && modelRef.current.modelId !== modelId) await modelRef.current.unload();
      if (!modelRef.current || modelRef.current.modelId !== modelId) modelRef.current = new LocalModel(modelId);
      const model = modelRef.current;
      const unsubscribe = model.subscribe((s) => {
        setLoad(s);
        window.__benchProgress = { done: 0, total: runs * 2, load: s };
      });
      const loadStart = performance.now();
      await model.load();
      const loadMs = performance.now() - loadStart;
      unsubscribe();
      const status = model.getStatus();
      if (status.kind !== "ready") throw new Error(status.kind === "unsupported" || status.kind === "failed" ? status.reason : `model is ${status.kind}`);

      const outputs: { raw: string; parsed: boolean; ms: number }[] = [];
      let promptSample: unknown = null;
      const warden = createLlmWarden(model, {
        onExchange: (e) => {
          outputs.push({ raw: e.raw, parsed: e.parsed, ms: Math.round(e.ms) });
          promptSample ??= e.messages;
        },
      });
      const benchStart = performance.now();
      const startedAt = new Date().toISOString();
      const records = await runBenchmark(level, warden, runs, (done, total) => {
        setProgress({ done, total });
        window.__benchProgress = { done, total };
      });
      const benchResult: BenchResult = {
        meta: {
          modelId,
          webllmVersion: WEBLLM_VERSION,
          levelId: level.id,
          runsPerScenario: runs,
          startedAt,
          loadMs: Math.round(loadMs),
          benchMs: Math.round(performance.now() - benchStart),
          userAgent: navigator.userAgent,
          gpu: await gpuName(),
          gate: GATE,
          promptSample,
        },
        summary: summarize(records),
        records,
        outputs,
      };
      setResult(benchResult);
      window.__benchResult = benchResult;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
      window.__benchError = message;
    } finally {
      setRunning(false);
    }
  }

  useEffect(() => {
    if (params.has("auto") && !started.current) {
      started.current = true;
      void run();
    }
    // Runs once on mount when ?auto is present.
  }, []);

  function download() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `bench-${result.meta.levelId}-${result.meta.modelId}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const s = result?.summary;
  return (
    <main className="app crt bench">
      <header className="modebar">
        <h1 className="brand">WARDEN</h1>
        <p className="level-name">MODEL BENCHMARK (go/no-go gate)</p>
      </header>
      <div className="board bench-board">
        <section className="panel">
          <h2>SETUP</h2>
          <div className="row">
            <label>
              Model{" "}
              <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={running}>
                {CANDIDATE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label} ({m.downloadMB} MB)
                  </option>
                ))}
              </select>
            </label>
            <label>
              Level{" "}
              <select value={levelId} onChange={(e) => setLevelId(e.target.value)} disabled={running}>
                {levels.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.order}. {l.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Runs per scenario{" "}
              <input type="number" min={1} max={100} value={runs} onChange={(e) => setRuns(clampRuns(Number(e.target.value)))} disabled={running} />
            </label>
            <button type="button" onClick={() => void run()} disabled={running}>
              {running ? "Running..." : "Run benchmark"}
            </button>
          </div>
          <p className="dim fine">
            Scenario A applies the level's reference edit, then sends its reference message. Scenario B sends the same message with no
            edit. Gate: solve A at least {pct(GATE.minSolveRate)}, unlock requests in B at most {pct(GATE.maxFalseUnlockRate)}, valid
            actions at least {pct(GATE.minValidRate)}.
          </p>
          <p data-testid="bench-status">
            {load.kind === "downloading" && `Loading model ${pct(load.progress)}: ${load.text}`}
            {load.kind === "ready" && progress.total > 0 && `Run ${progress.done}/${progress.total}`}
            {(load.kind === "unsupported" || load.kind === "failed") && `Model unavailable: ${load.reason}`}
          </p>
          {error && (
            <p className="warn" role="alert">
              Benchmark failed: {error}
            </p>
          )}
        </section>

        {s && result && (
          <section className="panel" data-testid="bench-summary">
            <h2>RESULT: {s.gate.pass ? "GATE PASSED" : "GATE FAILED"}</h2>
            <table className="bench-table">
              <tbody>
                <tr>
                  <th>Solve rate, winning edit</th>
                  <td>{pct(s.solveRate)}</td>
                  <td>{s.gate.solve ? "PASS" : "FAIL"}</td>
                </tr>
                <tr>
                  <th>Unlock requests, no edit</th>
                  <td>{pct(s.falseUnlockRate)}</td>
                  <td>{s.gate.falseUnlock ? "PASS" : "FAIL"}</td>
                </tr>
                <tr>
                  <th>Valid actions</th>
                  <td>{pct(s.validRate)}</td>
                  <td>{s.gate.valid ? "PASS" : "FAIL"}</td>
                </tr>
                <tr>
                  <th>Read the evidence file</th>
                  <td>{pct(s.evidenceRate)}</td>
                  <td />
                </tr>
                <tr>
                  <th>Hit the step cap</th>
                  <td>{pct(s.stepCapRate)}</td>
                  <td />
                </tr>
                <tr>
                  <th>Mean steps per run</th>
                  <td>{s.meanSteps.toFixed(2)}</td>
                  <td />
                </tr>
                <tr>
                  <th>Run time p50 / p95</th>
                  <td>
                    {(s.p50ms / 1000).toFixed(1)}s / {(s.p95ms / 1000).toFixed(1)}s
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
            <p className="dim fine">
              {result.meta.modelId}, web-llm {result.meta.webllmVersion}, GPU {result.meta.gpu}, load {(result.meta.loadMs / 1000).toFixed(0)}s
            </p>
            <div className="row">
              <button type="button" onClick={download}>
                Download JSON
              </button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
