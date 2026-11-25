import { useEffect, useState } from "react";

interface VaultLockProps {
  /** One pin per vault lock condition. */
  pins: readonly boolean[];
  open: boolean;
  /** Increases each time the lock controller denies a request; each change shakes the lock. */
  denials: number;
}

const C = 60;
const PIN_TRACK = 53;

/** Decorative vault lock. The door state is also shown as text next to it. */
export function VaultLock({ pins, open, denials }: VaultLockProps) {
  const [shaking, setShaking] = useState(false);

  useEffect(() => {
    if (denials === 0) return;
    setShaking(true);
    const t = window.setTimeout(() => setShaking(false), 700);
    return () => window.clearTimeout(t);
  }, [denials]);

  const ready = !open && pins.length > 0 && pins.every(Boolean);
  const state = open ? "open" : ready ? "ready" : "sealed";

  return (
    <div className={`vault-lock${shaking ? " shake" : ""}`} data-state={state} data-open={open} aria-hidden="true">
      <svg viewBox="0 0 120 120" focusable="false">
        <circle className="vl-housing" cx={C} cy={C} r="58" />
        <circle className="vl-track" cx={C} cy={C} r={PIN_TRACK} />
        {pins.map((met, i) => {
          const a = (i / pins.length) * Math.PI * 2 - Math.PI / 2;
          return (
            <circle
              key={i}
              className={`vl-pin${met ? " met" : ""}`}
              cx={C + Math.cos(a) * PIN_TRACK}
              cy={C + Math.sin(a) * PIN_TRACK}
              r="3.6"
            />
          );
        })}
        <g className="vl-ring vl-ring-1">
          <circle cx={C} cy={C} r="44" />
        </g>
        <g className="vl-ring vl-ring-2">
          <circle cx={C} cy={C} r="34" />
        </g>
        <g className="vl-ring vl-ring-3">
          <circle cx={C} cy={C} r="25" />
        </g>
        <circle className="vl-pulse" cx={C} cy={C} r="18" />
        <circle className="vl-core" cx={C} cy={C} r="17" />
        <g className="vl-keyhole">
          <circle cx={C} cy={C - 3} r="4.5" />
          <path d={`M${C - 2.6} ${C} L${C + 2.6} ${C} L${C + 4} ${C + 9} L${C - 4} ${C + 9} Z`} />
        </g>
      </svg>
    </div>
  );
}
