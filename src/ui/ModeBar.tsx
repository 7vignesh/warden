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
  mode: Warden["kind"];
  turn: number;
  ai?: AiControls;
}

function AiStatus({ ai, mode }: { ai: AiControls; mode: Warden["kind"] }) {
  const { status } = ai;
  switch (status.kind) {
    case "idle":
      return null;
    case "available":
      return (
        <p className="ai-status" data-testid="ai-status" data-state="available">
          <button type="button" onClick={ai.onLoad} title={AI_NOTE}>
            Load AI warden [{AI_EXPERIMENTAL}]: {ai.modelLabel}, {ai.downloadMB} MB download
          </button>
        </p>
      );
    case "unsupported":
      return (
        <p className="ai-status dim" data-testid="ai-status" data-state="unsupported">
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
        <p className="ai-status dim" data-testid="ai-status" data-state="downloading">
          <label htmlFor="ai-progress">
            Loading AI warden [{AI_EXPERIMENTAL}] ({ai.modelLabel}, {ai.downloadMB} MB) {pct}%
          </label>{" "}
          <progress id="ai-progress" max={1} value={status.progress} />
        </p>
      );
    }
    case "ready":
      return (
        <p className="ai-status" data-testid="ai-status" data-state="ready">
          {mode === "simulator" ? (
            <button type="button" onClick={() => ai.onSwitch("llm")} title={AI_NOTE}>
              Switch to AI Warden [{AI_EXPERIMENTAL}]
            </button>
          ) : (
            <button type="button" onClick={() => ai.onSwitch("simulator")}>
              Switch to Simulator
            </button>
          )}
        </p>
      );
  }
}

export function ModeBar({ level, mode, turn, ai }: ModeBarProps) {
  const label = MODE_LABEL[mode];
  return (
    <header className="modebar">
      <h1 className="brand">WARDEN</h1>
      <p className="level-name">
        LEVEL {level.order}: {level.title.toUpperCase()}
      </p>
      <p className="mode" data-testid="mode" data-mode={mode}>
        WARDEN MODE: <strong>{label.name}</strong> <span className="dim">({label.note})</span>
      </p>
      {ai && <AiStatus ai={ai} mode={mode} />}
      <p className="count" data-testid="msg-count" aria-label={`${turn} of ${MAX_PLAYER_MESSAGES} messages used`}>
        MSG {turn}/{MAX_PLAYER_MESSAGES}
      </p>
    </header>
  );
}
