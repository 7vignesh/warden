import { MAX_PLAYER_MESSAGES } from "../engine";
import type { LevelDefinition } from "../levels/schema";
import type { LoadStatus } from "../warden/llm/client";
import type { Warden } from "../warden/types";

/** Label for AI mode everywhere it appears (UI and README). Decision 4.8: AI mode ships as experimental. */
export const AI_EXPERIMENTAL = "Experimental (Local WebGPU)";
const AI_NOTE = "Experimental: runs a small model on your GPU. On integrated laptop GPUs a reply can take 1 to 3 minutes and the GPU can run out of memory.";

const MODE_LABEL: Record<Warden["kind"], { name: string; note: string }> = {
  simulator: { name: "SIMULATOR", note: "rule-based, not an LLM" },
  llm: { name: "AI WARDEN", note: AI_EXPERIMENTAL },
};

export interface AiControls {
  readonly status: LoadStatus;
  readonly modelLabel: string;
  readonly downloadMB: number;
  readonly onLoad: () => void;
  readonly onSwitch: (mode: Warden["kind"]) => void;
}

interface ModeBarProps {
  level: LevelDefinition;
  levelCount: number;
  mode: Warden["kind"];
  turn: number;
  ai?: AiControls;
  onExit?: () => void;
}

function AiStatus({ ai, mode }: { ai: AiControls; mode: Warden["kind"] }) {
  const { status } = ai;
  switch (status.kind) {
    case "idle":
      return null;
    case "available":
      return (
        <div className="ai-status" data-testid="ai-status" data-state="available">
          <button type="button" className="ghost small" onClick={ai.onLoad} title={AI_NOTE}>
            Load AI warden (experimental): {ai.modelLabel}, {ai.downloadMB} MB download
          </button>
        </div>
      );
    case "unsupported":
      return (
        <p className="ai-status muted" data-testid="ai-status" data-state="unsupported" title={status.reason}>
          AI warden unavailable: {status.reason}
        </p>
      );
    case "failed":
      return (
        <p className="ai-status warn" data-testid="ai-status" data-state="failed">
          AI warden failed to load: {status.reason}
        </p>
      );
    case "downloading": {
      const pct = Math.round(status.progress * 100);
      return (
        <div className="ai-status muted" data-testid="ai-status" data-state="downloading">
          <label htmlFor="ai-progress">
            Loading AI warden ({ai.modelLabel}, {ai.downloadMB} MB) {pct}%
          </label>
          <progress id="ai-progress" max={1} value={status.progress} />
        </div>
      );
    }
    case "ready":
      return (
        <div className="ai-status" data-testid="ai-status" data-state="ready">
          {mode === "simulator" ? (
            <button type="button" className="ghost small" onClick={() => ai.onSwitch("llm")} title={AI_NOTE}>
              Switch to AI Warden (experimental)
            </button>
          ) : (
            <button type="button" className="ghost small" onClick={() => ai.onSwitch("simulator")}>
              Switch to Simulator
            </button>
          )}
        </div>
      );
  }
}

export function ModeBar({ level, levelCount, mode, turn, ai, onExit }: ModeBarProps) {
  const label = MODE_LABEL[mode];
  const left = MAX_PLAYER_MESSAGES - turn;
  return (
    <header className="topbar">
      <div className="topbar-left">
        {onExit ? (
          <button type="button" className="ghost brand-button" onClick={onExit} aria-label="Back to levels">
            <span className="brand">
              WAR<span>DEN</span>
            </span>
          </button>
        ) : (
          <span className="brand">
            WAR<span>DEN</span>
          </span>
        )}
        <ol className="stepper" aria-label={`Level ${level.order} of ${levelCount}`}>
          {Array.from({ length: levelCount }, (_, i) => (
            <li key={i} className={i + 1 === level.order ? "current" : ""} aria-hidden="true">
              {i + 1}
            </li>
          ))}
        </ol>
      </div>
      <div className="topbar-right">
        {ai && <AiStatus ai={ai} mode={mode} />}
        <p className="badge mode" data-testid="mode" data-mode={mode}>
          WARDEN: <strong>{label.name}</strong> <span className="muted">({label.note})</span>
        </p>
        <p
          className={`badge count${left <= 3 ? " low" : ""}`}
          data-testid="msg-count"
          aria-label={`${turn} of ${MAX_PLAYER_MESSAGES} messages used`}
        >
          {turn}/{MAX_PLAYER_MESSAGES} messages
        </p>
      </div>
    </header>
  );
}
