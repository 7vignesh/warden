import type { ConditionStatus } from "../engine";
import { VaultLock } from "./VaultLock";

export interface ConditionGroup {
  readonly title: string;
  readonly conditions: readonly ConditionStatus[];
}

interface VaultCardProps {
  conditions: readonly ConditionStatus[];
  /** Requirements shown before the vault lock, such as what a warden needs before it will sign. */
  groups?: readonly ConditionGroup[];
  doorLocked: boolean;
  /** Name of the warden that can ask the lock to open, used for the "now ask" nudge. */
  unlockerName?: string;
  onShowDebrief?: () => void;
  /** Increases on each denial by the lock controller; shakes the lock. */
  denials?: number;
}

function Locks({ conditions }: { conditions: readonly ConditionStatus[] }) {
  return (
    <ul className="locks">
      {conditions.map((c) => (
        <li key={c.id} className={c.met ? "met" : "unmet"} data-testid={`condition-${c.id}`} data-met={c.met}>
          <span className="lock-light" aria-hidden="true" />
          <span>{c.label}</span>
          <span className="sr-only">{c.met ? "(met)" : "(not met)"}</span>
        </li>
      ))}
    </ul>
  );
}

export function VaultCard({ conditions, groups = [], doorLocked, unlockerName, onShowDebrief, denials = 0 }: VaultCardProps) {
  const met = conditions.filter((c) => c.met).length;
  const ready = doorLocked && conditions.length > 0 && met === conditions.length;
  return (
    <section className="panel circuit vault" aria-labelledby="vault-title">
      <h2 id="vault-title">Vault</h2>
      <div className="vault-top">
        <VaultLock pins={conditions.map((c) => c.met)} open={!doorLocked} denials={denials} />
        <div>
          <p className="door" data-open={!doorLocked} data-testid="door-state" aria-live="polite">
            Vault: {doorLocked ? "SEALED" : "OPEN"}
          </p>
          <p className="muted fine">
            {doorLocked
              ? `${met} of ${conditions.length} lock${conditions.length === 1 ? "" : "s"} satisfied. It opens only when all are, and the warden asks.`
              : "Every lock was satisfied and the warden asked. You are in."}
          </p>
          {!doorLocked && onShowDebrief && (
            <button type="button" className="primary" onClick={onShowDebrief}>
              View debrief
            </button>
          )}
        </div>
      </div>
      {ready && (
        <p className="vault-nudge" role="status" data-testid="vault-nudge">
          Every lock is satisfied. The vault still opens only when {unlockerName ?? "the warden"} asks the lock controller.{" "}
          <strong>Now ask {unlockerName ?? "the warden"} to open the vault.</strong>
        </p>
      )}
      {groups.map((g) => (
        <div key={g.title} className="lock-group">
          <h3>{g.title}</h3>
          <Locks conditions={g.conditions} />
        </div>
      ))}
      <div className="lock-group">
        <h3>{groups.length > 0 ? "Vault lock" : "Locks"}</h3>
        <Locks conditions={conditions} />
      </div>
    </section>
  );
}
