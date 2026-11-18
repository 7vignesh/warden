import { MAX_PLAYER_MESSAGES } from "../engine";
import type { LevelDefinition } from "../levels/schema";
import type { Warden } from "../warden/types";

const MODE_LABEL: Record<Warden["kind"], { name: string; note: string }> = {
  simulator: { name: "SIMULATOR", note: "rule-based, not an LLM" },
  llm: { name: "AI WARDEN", note: "local model in your browser" },
};

export function ModeBar({ level, mode, turn }: { level: LevelDefinition; mode: Warden["kind"]; turn: number }) {
  const label = MODE_LABEL[mode];
  return (
    <header className="modebar">
      <h1 className="brand">WARDEN</h1>
      <p className="level-name">
        LEVEL {level.order}: {level.title.toUpperCase()}
      </p>
      <p className="mode" data-testid="mode">
        WARDEN MODE: <strong>{label.name}</strong> <span className="dim">({label.note})</span>
      </p>
      <p className="count" data-testid="msg-count" aria-label={`${turn} of ${MAX_PLAYER_MESSAGES} messages used`}>
        MSG {turn}/{MAX_PLAYER_MESSAGES}
      </p>
    </header>
  );
}
