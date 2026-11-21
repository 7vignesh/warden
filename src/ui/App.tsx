import { useState } from "react";
import { loadAllLevels } from "../levels/registry";
import { LocalModel } from "../warden/llm/client";
import { createLlmWarden } from "../warden/llm/llm-warden";
import { GAME_MODEL } from "../warden/llm/models";
import { createSimulatorWarden } from "../warden/simulator";
import type { Warden } from "../warden/types";
import { Game } from "./Game";
import type { AiControls } from "./ModeBar";
import { StartScreen } from "./StartScreen";
import { useLocalModel } from "./useLocalModel";

const LEVEL_SET = loadAllLevels();
const simulator = createSimulatorWarden();
const localModel = new LocalModel(GAME_MODEL.id);
const llmWarden = createLlmWarden(localModel);

export function App() {
  // null shows the start screen; a number is the level being played.
  const [index, setIndex] = useState<number | null>(null);
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

  if (levels.length === 0) {
    return (
      <main className="app load-error" role="alert">
        <h1 className="brand">WARDEN</h1>
        <p>No playable levels could be loaded.</p>
        <LevelErrors errors={errors} />
      </main>
    );
  }

  const errorBanner = errors.length > 0 && (
    <div className="banner lost" role="alert">
      Some level files were skipped because they are invalid.
      <LevelErrors errors={errors} />
    </div>
  );

  const level = index === null ? undefined : levels[Math.min(index, levels.length - 1)];
  if (!level || index === null) {
    return (
      <>
        {errorBanner}
        <StartScreen levels={levels} onStart={setIndex} />
      </>
    );
  }

  return (
    <>
      {errorBanner}
      <Game
        key={level.id}
        level={level}
        levelCount={levels.length}
        warden={warden}
        ai={ai}
        hasNext={index < levels.length - 1}
        onNext={() => setIndex((i) => Math.min((i ?? 0) + 1, levels.length - 1))}
        onExit={() => setIndex(null)}
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
