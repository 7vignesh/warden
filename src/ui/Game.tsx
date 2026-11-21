import { useMemo, useState } from "react";
import { evaluateConditions } from "../engine";
import type { LevelDefinition } from "../levels/schema";
import type { Warden } from "../warden/types";
import { Chat } from "./Chat";
import { Debrief } from "./Debrief";
import { FileEditor } from "./FileEditor";
import "./game.css";
import { MissionCard } from "./MissionCard";
import { ModeBar, type AiControls } from "./ModeBar";
import { useGame } from "./useGame";
import { VaultCard } from "./VaultCard";

interface GameProps {
  level: LevelDefinition;
  levelCount: number;
  warden: Warden;
  ai?: AiControls;
  hasNext: boolean;
  onNext: () => void;
  onExit?: () => void;
}

/** One level attempt. Mount with key={level.id} so switching levels starts fresh. */
export function Game({ level, levelCount, warden, ai, hasNext, onNext, onExit }: GameProps) {
  const game = useGame(level, warden);
  const { session } = game;
  const [activeId, setActiveId] = useState(() => level.wardens[0]?.id ?? "");
  const active = level.wardens.find((w) => w.id === activeId) ?? level.wardens[0];
  const [selected, setSelected] = useState(() => Object.keys(level.files)[0] ?? "");
  const [debriefDismissed, setDebriefDismissed] = useState(false);
  const rules = level.signRules;
  const groups = useMemo(() => {
    if (!rules) return [];
    const signer = level.wardens.find((w) => w.id === rules.by)?.name ?? rules.by;
    return [{ title: `${signer} signs only if`, conditions: evaluateConditions(session.state, rules.when).conditions }];
  }, [rules, level.wardens, session.state]);

  if (!active) return null;
  const playing = session.status === "playing";

  function restart() {
    game.restart();
    setActiveId(level.wardens[0]?.id ?? "");
    setDebriefDismissed(false);
  }

  return (
    <div className="app game">
      <ModeBar
        level={level}
        levelCount={levelCount}
        mode={warden.kind}
        turn={session.state.turn}
        {...(ai ? { ai } : {})}
        {...(onExit ? { onExit } : {})}
      />
      <main className="layout">
        <MissionCard
          level={level}
          hintsShown={game.hintsShown}
          onRevealHint={game.revealHint}
          onRestart={restart}
          canRestart={!game.busy}
        />
        <Chat
          wardens={level.wardens}
          activeId={active.id}
          onSelectWarden={setActiveId}
          trace={session.trace}
          status={session.status}
          busy={game.busy}
          notice={game.notice}
          onSend={(text) => game.send(active.id, text)}
          onRestart={restart}
        />
        <div className="side">
          <FileEditor
            files={game.files}
            selected={selected}
            canEdit={playing && !game.busy}
            onSelect={setSelected}
            onDraft={game.setDraft}
            onSave={game.save}
            onRevert={game.revert}
          />
          <VaultCard
            conditions={game.predicate.conditions}
            groups={groups}
            doorLocked={session.state.doorLocked}
            onShowDebrief={() => setDebriefDismissed(false)}
          />
        </div>
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
