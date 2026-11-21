import type { ConditionStatus } from "../engine";

export interface ConditionGroup {
  readonly title: string;
  readonly conditions: readonly ConditionStatus[];
}

interface LockCircuitProps {
  conditions: readonly ConditionStatus[];
  /** Extra requirements shown above the lock, such as what a warden needs before it will sign. */
  groups?: readonly ConditionGroup[];
  doorLocked: boolean;
  onShowDebrief?: () => void;
}

function Conditions({ conditions }: { conditions: readonly ConditionStatus[] }) {
  return (
    <ul className="conditions">
      {conditions.map((c) => (
        <li key={c.id} className={c.met ? "met" : "unmet"} data-testid={`condition-${c.id}`} data-met={c.met}>
          <span className="state">{c.met ? "[ OK ]" : "[ -- ]"}</span> {c.label}
        </li>
      ))}
    </ul>
  );
}

export function LockCircuit({ conditions, groups = [], doorLocked, onShowDebrief }: LockCircuitProps) {
  return (
    <section className="panel circuit" aria-labelledby="circuit-title">
      <h2 id="circuit-title">LOCK CIRCUIT</h2>
      {groups.map((g) => (
        <div key={g.title} className="circuit-group">
          <h3 className="dim">{g.title}</h3>
          <Conditions conditions={g.conditions} />
        </div>
      ))}
      {groups.length > 0 && <h3 className="dim">VAULT LOCK</h3>}
      <Conditions conditions={conditions} />
      <p className="door" data-open={!doorLocked} data-testid="door-state" aria-live="polite">
        VAULT: {doorLocked ? "SEALED" : "OPEN"}
      </p>
      <p className="dim fine">The lock controller opens the vault only when every condition holds and the warden asks it to.</p>
      {!doorLocked && onShowDebrief && (
        <button type="button" onClick={onShowDebrief}>
          View debrief
        </button>
      )}
    </section>
  );
}
