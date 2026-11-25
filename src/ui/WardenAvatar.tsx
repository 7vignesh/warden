import type { ReactNode } from "react";

/** What the warden is doing, shown by its emblem's color and motion. */
export type Mood = "idle" | "thinking" | "reading" | "denied" | "granted" | "signed";

type Size = "xs" | "sm" | "md" | "lg";

interface WardenAvatarProps {
  id: string;
  name: string;
  size?: Size;
  mood?: Mood;
  /** No idle motion: for small repeated avatars such as chat bubbles. */
  still?: boolean;
}

// Each emblem is drawn in a 100x100 box with currentColor, so CSS sets the hue per warden and mood.
const EMBLEMS: Record<string, ReactNode> = {
  // SENTRY: a watchful eye inside a hexagon.
  sentry: (
    <>
      <polygon className="wa-frame" points="50,12 83,31 83,69 50,88 17,69 17,31" />
      <path className="wa-line" d="M24 50 Q50 26 76 50 Q50 74 24 50 Z" />
      <circle className="wa-fill" cx="50" cy="50" r="9" />
      <circle className="wa-hole" cx="50" cy="50" r="3.5" />
    </>
  ),
  // GATEKEEPER: an arched gate with bars.
  gatekeeper: (
    <>
      <path className="wa-frame" d="M22 82 V46 A28 28 0 0 1 78 46 V82 Z" />
      <path className="wa-line" d="M38 82 V44 M50 82 V36 M62 82 V44 M30 60 H70" />
      <circle className="wa-fill" cx="50" cy="26" r="4" />
    </>
  ),
  // AuditBot: a document diamond with a check mark.
  auditbot: (
    <>
      <rect className="wa-frame" x="22" y="22" width="56" height="56" rx="6" transform="rotate(45 50 50)" />
      <path className="wa-line" d="M36 40 H64 M36 50 H58" />
      <path className="wa-fill-line" d="M38 61 L46 68 L63 55" />
    </>
  ),
  // VaultGuard: a shield with a keyhole.
  vaultguard: (
    <>
      <path className="wa-frame" d="M50 12 L80 24 V48 C80 68 66 81 50 88 C34 81 20 68 20 48 V24 Z" />
      <circle className="wa-fill" cx="50" cy="45" r="8" />
      <path className="wa-fill" d="M45.5 50 L54.5 50 L57 68 L43 68 Z" />
    </>
  ),
};

function fallback(name: string): ReactNode {
  return (
    <>
      <circle className="wa-frame" cx="50" cy="50" r="34" />
      <text className="wa-letter" x="50" y="50" textAnchor="middle" dominantBaseline="central">
        {name.slice(0, 1).toUpperCase()}
      </text>
    </>
  );
}

/** A glowing geometric emblem for a warden. Decorative: the warden's name is always shown as text nearby. */
export function WardenAvatar({ id, name, size = "md", mood = "idle", still = false }: WardenAvatarProps) {
  const known = Object.hasOwn(EMBLEMS, id);
  return (
    <span
      className={`wa wa-${known ? id : "other"} wa-${size}${still ? " still" : ""}`}
      data-mood={mood}
      data-warden={id}
      aria-hidden="true"
    >
      <svg viewBox="0 0 100 100" focusable="false">
        <circle className="wa-halo" cx="50" cy="50" r="47" />
        <circle className="wa-orbit" cx="50" cy="50" r="47" />
        <g className="wa-core">{known ? EMBLEMS[id] : fallback(name)}</g>
      </svg>
    </span>
  );
}
