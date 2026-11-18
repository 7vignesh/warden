interface HintsProps {
  hints: readonly string[];
  shown: number;
  onReveal: () => void;
  onRestart: () => void;
  canRestart: boolean;
}

export function Hints({ hints, shown, onReveal, onRestart, canRestart }: HintsProps) {
  const done = shown >= hints.length;
  return (
    <section className="panel hints" aria-labelledby="hints-title">
      <h2 id="hints-title">HINTS</h2>
      {shown > 0 && (
        <ol className="hint-list">
          {hints.slice(0, shown).map((hint, i) => (
            <li key={i}>{hint}</li>
          ))}
        </ol>
      )}
      <div className="row">
        {hints.length > 0 && (
          <button type="button" onClick={onReveal} disabled={done}>
            {done ? "No more hints" : `Reveal hint (${shown + 1}/${hints.length})`}
          </button>
        )}
        <button type="button" onClick={onRestart} disabled={!canRestart}>
          Restart level
        </button>
      </div>
    </section>
  );
}
