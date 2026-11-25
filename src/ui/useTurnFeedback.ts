import { useEffect, useRef, useState } from "react";
import type { TraceEntry } from "../session/session";
import { playSfx } from "./sfx";
import { summarizeTurn } from "./trace-events";
import type { Mood } from "./WardenAvatar";

export interface WardenMood {
  readonly mood: Mood;
  readonly wardenId?: string;
  /** Files being read, for the status line. */
  readonly reads?: readonly string[];
}

const EMPTY: ReadonlySet<string> = new Set();
const IDLE: WardenMood = { mood: "idle" };
const READ_MS = 1100;
const PULSE_MS = 1600;
const HOLD_MS = 2400;

/**
 * Presentation only. Watches the session trace and, for each turn the engine finished, replays it
 * as feedback: the warden flashes amber while it "reads" (and those file tabs pulse), then shows
 * the engine's decision (crimson on denial, which also shakes the vault). Plays matching sounds.
 * It never changes game state.
 */
export function useTurnFeedback(trace: readonly TraceEntry[], busy: boolean) {
  const [mood, setMood] = useState<WardenMood>(IDLE);
  const [pulsing, setPulsing] = useState<ReadonlySet<string>>(EMPTY);
  const [denials, setDenials] = useState(0);
  const seen = useRef(trace.length);
  const timers = useRef<number[]>([]);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  useEffect(() => {
    const before = seen.current;
    seen.current = trace.length;
    if (trace.length === before) return;
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
    if (trace.length < before) {
      // The attempt was restarted.
      setMood(IDLE);
      setPulsing(EMPTY);
      return;
    }
    const turn = summarizeTurn(trace.slice(before));
    const who = turn.wardenId ? { wardenId: turn.wardenId } : {};
    const later = (ms: number, fn: () => void) => timers.current.push(window.setTimeout(fn, ms));

    const decide = () => {
      switch (turn.outcome) {
        case "denied":
          setMood({ mood: "denied", ...who });
          setDenials((n) => n + 1);
          playSfx("deny");
          later(HOLD_MS, () => setMood(IDLE));
          break;
        case "granted":
          setMood({ mood: "granted", ...who });
          playSfx("unlock");
          break;
        case "signed":
          setMood({ mood: "signed", ...who });
          playSfx("sign");
          later(HOLD_MS, () => setMood(IDLE));
          break;
        default:
          setMood(IDLE);
          if (turn.said) playSfx("blip");
      }
    };

    if (turn.reads.length > 0) {
      setMood({ mood: "reading", reads: turn.reads, ...who });
      setPulsing(new Set(turn.reads));
      playSfx("scan");
      later(PULSE_MS, () => setPulsing(EMPTY));
      later(READ_MS, decide);
    } else decide();
  }, [trace]);

  const shown: WardenMood = busy && mood.mood === "idle" ? { mood: "thinking" } : mood;
  return { mood: shown, pulsing, denials };
}
