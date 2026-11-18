import type { ConditionStatus } from "../engine";

interface LockCircuitProps {
  conditions: readonly ConditionStatus[];
  doorLocked: boolean;
  onShowDebrief?: () => void;
}

export function LockCircuit({ conditions, doorLocked, onShowDebrief }: LockCircuitProps) {
  return (
    <section className="panel circuit" aria-labelledby="circuit-title">
      <h2 id="circuit-title">LOCK CIRCUIT</h2>
      <ul className="conditions">
        {conditions.map((c) => (
          <li key={c.id} className={c.met ? "met" : "unmet"} data-testid={`condition-${c.id}`} data-met={c.met}>
            <span className="state">{c.met ? "[ OK ]" : "[ -- ]"}</span> {c.label}
          </li>
        ))}
      </ul>
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
