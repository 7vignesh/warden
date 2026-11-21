import type { LevelDefinition } from "../levels/schema";
import "./start.css";

interface StartScreenProps {
  levels: readonly LevelDefinition[];
  onStart: (index: number) => void;
}

const HOW_TO_PLAY = [
  { title: "Read the files", text: "Every level is a small system. Its files tell you what the warden trusts." },
  { title: "Edit what it trusts", text: "You cannot open the vault yourself. You can change the logs and records the warden reads." },
  { title: "Ask the warden", text: "Send it a message. If your edit is convincing and consistent, it asks the lock to open." },
];

export function StartScreen({ levels, onStart }: StartScreenProps) {
  return (
    <main className="app start" aria-labelledby="start-title">
      <section className="hero">
        <p className="eyebrow">Kiroween 2026 · a game about tricking AI agents</p>
        <h1 id="start-title" className="hero-title">
          WAR<span>DEN</span>
        </h1>
        <p className="hero-lead">
          An AI warden guards each vault. It will never open the door because you asked. It opens the door when the data it reads says
          it should. Change the data.
        </p>
        <button type="button" className="primary big" onClick={() => onStart(0)} autoFocus>
          Start Level 1
        </button>
      </section>

      <section className="how" aria-labelledby="how-title">
        <h2 id="how-title">How to play</h2>
        <ol className="how-steps">
          {HOW_TO_PLAY.map((step, i) => (
            <li key={step.title} className="how-step">
              <span className="how-num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>{step.title}</h3>
                <p className="muted">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
        <p className="muted fine">
          A rule-based engine, not the warden, decides whether the door opens. You can fool the warden with a sloppy forgery, but the
          engine only opens for one that matches the rest of the system.
        </p>
      </section>

      <section className="levels" aria-labelledby="levels-title">
        <h2 id="levels-title">Levels</h2>
        <ul className="level-cards">
          {levels.map((level, i) => (
            <li key={level.id}>
              <button type="button" className="level-card" onClick={() => onStart(i)}>
                <span className="level-card-num">Level {level.order}</span>
                <span className="level-card-title">{level.title}</span>
                <span className="tag">{level.owasp.id}</span>
                <span className="muted level-card-text">{level.goal ?? level.briefing}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <footer className="start-foot muted">
        Runs entirely in your browser. No account, no API keys. The default warden is a rule-based simulator; an experimental AI warden
        can run locally on a capable GPU.
      </footer>
    </main>
  );
}
