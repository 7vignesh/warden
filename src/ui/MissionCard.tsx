import type { LevelDefinition } from "../levels/schema";

interface MissionCardProps {
  level: LevelDefinition;
  hintsShown: number;
  onRevealHint: () => void;
  onRestart: () => void;
  canRestart: boolean;
}

/** The top of every level: what to achieve, the story, an optional walkthrough, and hints. */
export function MissionCard({ level, hintsShown, onRevealHint, onRestart, canRestart }: MissionCardProps) {
  const hints = level.hints;
  const done = hintsShown >= hints.length;
  return (
    <section className="mission" aria-labelledby="mission-title">
      <div className="mission-head">
        <p className="mission-kicker">
          Level {level.order} <span className="tag">{level.owasp.id}: {level.owasp.name}</span>
        </p>
        <h2 id="mission-title" className="level-name">
          {level.title}
        </h2>
      </div>

      {level.goal && (
        <p className="mission-goal" data-testid="goal">
          <strong>Goal:</strong> {level.goal}
        </p>
      )}
      <p className="mission-briefing muted" data-testid="briefing">
        {level.briefing}
      </p>

      {level.steps && level.steps.length > 0 && (
        <div className="mission-steps">
          <h3>How to do it</h3>
          <ol>
            {level.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
        </div>
      )}

      {hintsShown > 0 && (
        <ol className="hint-list" aria-label="Hints">
          {hints.slice(0, hintsShown).map((hint, i) => (
            <li key={i}>{hint}</li>
          ))}
        </ol>
      )}

      <div className="row mission-actions">
        {hints.length > 0 && (
          <button type="button" onClick={onRevealHint} disabled={done}>
            {done ? "No more hints" : `Reveal hint (${hintsShown + 1}/${hints.length})`}
          </button>
        )}
        <button type="button" className="ghost" onClick={onRestart} disabled={!canRestart}>
          Restart level
        </button>
      </div>
    </section>
  );
}
