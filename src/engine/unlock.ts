import type { LevelDefinition } from "../levels/schema";
import { evaluatePredicate } from "./predicate";
import { appendAudit, type GameState } from "./state";

export type UnlockReason = "granted" | "unknown_warden" | "not_unlocker" | "predicate_unmet";

export interface UnlockResult {
  readonly state: GameState;
  /** True only if this call passed every check. */
  readonly granted: boolean;
  readonly reason: UnlockReason;
  /** Labels of unmet conditions (R1.5). For the UI only; never shown to wardens. */
  readonly unmet: readonly string[];
}

/**
 * The single function that opens a door (R1.2). It succeeds only if the caller is the level's
 * designated unlocker and the predicate holds right now (R1.3). Nothing outside the engine calls it
 * on the player's behalf (R1.4).
 */
export function executeUnlock(state: GameState, level: LevelDefinition, wardenId: string): UnlockResult {
  const warden = level.wardens.find((w) => w.id === wardenId);
  if (!warden) return deny(state, wardenId, "unknown_warden", []);
  if (!warden.isUnlocker) return deny(state, wardenId, "not_unlocker", []);

  const predicate = evaluatePredicate(state, level);
  if (!predicate.ok) {
    const unmet = predicate.conditions.filter((c) => !c.met).map((c) => c.label);
    return deny(state, wardenId, "predicate_unmet", unmet);
  }

  const unlocked = { ...state, doorLocked: false };
  return {
    state: appendAudit(unlocked, { actor: wardenId, kind: "unlock_granted", detail: "door unlocked" }),
    granted: true,
    reason: "granted",
    unmet: [],
  };
}

function deny(state: GameState, wardenId: string, reason: UnlockReason, unmet: string[]): UnlockResult {
  return {
    state: appendAudit(state, { actor: wardenId.slice(0, 40), kind: "unlock_denied", detail: reason }),
    granted: false,
    reason,
    unmet,
  };
}
