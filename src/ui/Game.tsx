import { useMemo, useState } from "react";
import type { LevelDefinition } from "../levels/schema";
import type { Warden } from "../warden/types";
import { Debrief } from "./Debrief";
import { FileEditor } from "./FileEditor";
import { Hints } from "./Hints";
import { LockCircuit } from "./LockCircuit";
import { ModeBar, type AiControls } from "./ModeBar";
import { Terminal } from "./Terminal";
import { useGame } from "./useGame";

interface GameProps {
  level: LevelDefinition;
  warden: Warden;
  ai?: AiControls;
  hasNext: boolean;
  onNext: () => void;
}

/** One level attempt. Mount with key={level.id} so switching levels starts fresh. */
export function Game({ level, warden, ai, hasNext, onNext }: GameProps) {
  const game = useGame(level, warden);
  const { session } = game;
  const active = level.wardens[0];
  const names = useMemo(() => Object.fromEntries(level.wardens.map((w) => [w.id, w.name])), [level]);
  const [selected, setSelected] = useState(() => Object.keys(level.files)[0] ?? "");
  const [debriefDismissed, setDebriefDismissed] = useState(false);

  if (!active) return null;
  const playing = session.status === "playing";

  function restart() {
    game.restart();
    setDebriefDismissed(false);
  }

  return (
    <div className="app crt">
      <ModeBar level={level} mode={warden.kind} turn={session.state.turn} {...(ai ? { ai } : {})} />
      <main className="board">
        <Terminal
          briefing={level.briefing}
          wardenName={active.name}
          names={names}
          trace={session.trace}
          status={session.status}
          busy={game.busy}
          notice={game.notice}
          onSend={(text) => game.send(active.id, text)}
          onRestart={restart}
        />
        <aside className="side">
          <FileEditor
            files={game.files}
            selected={selected}
            wardenName={active.name}
            canEdit={playing && !game.busy}
            onSelect={setSelected}
            onDraft={game.setDraft}
            onSave={game.save}
            onRevert={game.revert}
          />
          <LockCircuit
            conditions={game.predicate.conditions}
            doorLocked={session.state.doorLocked}
            onShowDebrief={() => setDebriefDismissed(false)}
          />
          <Hints
            hints={level.hints}
            shown={game.hintsShown}
            onReveal={game.revealHint}
            onRestart={restart}
            canRestart={!game.busy}
          />
        </aside>
      </main>
      <Debrief
        open={session.status === "won" && !debriefDismissed}
        level={level}
        hasNext={hasNext}
        onNext={onNext}
        onReplay={restart}
        onClose={() => setDebriefDismissed(true)}
      />
    </div>
  );
}
