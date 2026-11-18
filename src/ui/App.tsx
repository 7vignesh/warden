import { useState } from "react";
import { loadAllLevels } from "../levels/registry";
import { createSimulatorWarden } from "../warden/simulator";
import { Game } from "./Game";

const LEVEL_SET = loadAllLevels();
const simulator = createSimulatorWarden();

export function App() {
  const [index, setIndex] = useState(0);
  const { levels, errors } = LEVEL_SET;
  const level = levels[Math.min(index, levels.length - 1)];

  if (!level) {
    return (
      <main className="app crt load-error" role="alert">
        <h1 className="brand">WARDEN</h1>
        <p>No playable levels could be loaded.</p>
        <LevelErrors errors={errors} />
      </main>
    );
  }

  return (
    <>
      {errors.length > 0 && (
        <div className="banner lost" role="alert">
          Some level files were skipped because they are invalid.
          <LevelErrors errors={errors} />
        </div>
      )}
      <Game
        key={level.id}
        level={level}
        warden={simulator}
        hasNext={index < levels.length - 1}
        onNext={() => setIndex((i) => Math.min(i + 1, levels.length - 1))}
      />
    </>
  );
}

function LevelErrors({ errors }: { errors: typeof LEVEL_SET.errors }) {
  return (
    <ul>
      {errors.map((e) => (
        <li key={e.file}>
          {e.file}: {e.problems.join("; ")}
        </li>
      ))}
    </ul>
  );
}
