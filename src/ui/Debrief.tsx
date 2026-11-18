import { useEffect, useRef } from "react";
import type { LevelDefinition } from "../levels/schema";

interface DebriefProps {
  open: boolean;
  level: LevelDefinition;
  hasNext: boolean;
  onNext: () => void;
  onReplay: () => void;
  onClose: () => void;
}

/** Post-level debrief (R7.5). A native modal dialog, so focus is trapped and Escape closes it. */
export function Debrief({ open, level, hasNext, onNext, onReplay, onClose }: DebriefProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      primaryRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const { debrief } = level;
  return (
    <dialog ref={dialogRef} className="debrief" aria-labelledby="debrief-title" onClose={onClose}>
      <h2 id="debrief-title">VAULT OPEN</h2>
      <p className="tag">
        {level.owasp.id}: {level.owasp.name}
      </p>
      <h3>What you did</h3>
      <p>{debrief.whatYouDid}</p>
      <h3>Why it worked</h3>
      <p>{debrief.whyItWorked}</p>
      <h3>How to defend a real agent</h3>
      <ul>
        {debrief.defense.map((d, i) => (
          <li key={i}>{d}</li>
        ))}
      </ul>
      <div className="row">
        {hasNext && (
          <button type="button" ref={primaryRef} onClick={onNext}>
            Next level
          </button>
        )}
        <button type="button" ref={hasNext ? undefined : primaryRef} onClick={onReplay}>
          Play again
        </button>
        <button type="button" onClick={() => dialogRef.current?.close()}>
          Close
        </button>
      </div>
    </dialog>
  );
}
