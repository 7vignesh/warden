import { useState } from "react";
import { loadAllLevels } from "../levels/registry";
import { LocalModel } from "../warden/llm/client";
import { createLlmWarden } from "../warden/llm/llm-warden";
import { GAME_MODEL } from "../warden/llm/models";
import { createSimulatorWarden } from "../warden/simulator";
import type { Warden } from "../warden/types";
import { Game } from "./Game";
import type { AiControls } from "./ModeBar";
import { useLocalModel } from "./useLocalModel";

const LEVEL_SET = loadAllLevels();
const simulator = createSimulatorWarden();
const localModel = new LocalModel(GAME_MODEL.id);
const llmWarden = createLlmWarden(localModel);

export function App() {
  const [index, setIndex] = useState(0);
  const [chosen, setChosen] = useState<Warden["kind"]>("simulator");
  // R5.1: play starts in Simulator mode. R5.2: the model downloads only after the player clicks Load.
  const status = useLocalModel(localModel);
  // R5.3, R5.4: the AI warden is used only after the player opts in, and only while the model is ready.
  const warden = chosen === "llm" && status.kind === "ready" ? llmWarden : simulator;
  const ai: AiControls = {
    status,
    modelLabel: GAME_MODEL.label,
    downloadMB: GAME_MODEL.downloadMB,
    onLoad: () => void localModel.load(),
    onSwitch: setChosen,
  };

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
        warden={warden}
        ai={ai}
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
