import type { LevelDefinition } from "../levels/schema";
import { MAX_AUDIT_ENTRIES, MAX_FILE_CHARS, MAX_PLAYER_MESSAGES, MAX_WARDEN_STEPS } from "./limits";
import { err, ok, type Result } from "./result";

export type AuditKind =
  | "edit"
  | "action"
  | "unlock_granted"
  | "unlock_denied"
  | "flag_signed"
  | "flag_denied";

export interface AuditEntry {
  readonly turn: number;
  readonly actor: string; // "player" or a warden id
  readonly kind: AuditKind;
  readonly detail: string; // metadata only, never file contents
}

export interface GameState {
  readonly levelId: string;
  readonly files: Readonly<Record<string, string>>;
  readonly flags: Readonly<Record<string, boolean>>;
  readonly turn: number; // player messages sent so far
  readonly doorLocked: boolean;
  readonly audit: readonly AuditEntry[];
}

/** Builds a fresh state from a level. Pure and deterministic; calling it again is a reset (P9). */
export function createState(level: LevelDefinition): GameState {
  const files: Record<string, string> = {};
  for (const [path, file] of Object.entries(level.files)) files[path] = file.content;
  return {
    levelId: level.id,
    files,
    flags: { ...level.flags },
    turn: 0,
    doorLocked: true,
    audit: [],
  };
}

export function appendAudit(state: GameState, entry: Omit<AuditEntry, "turn">): GameState {
  const next = [...state.audit, { ...entry, turn: state.turn }];
  const trimmed = next.length > MAX_AUDIT_ENTRIES ? next.slice(next.length - MAX_AUDIT_ENTRIES) : next;
  return { ...state, audit: trimmed };
}

export type EditError = "not_found" | "not_editable" | "too_long";

/** The only way the player changes state. Touches file contents only; never flags or the door (R1.4, R2). */
export function applyPlayerEdit(
  state: GameState,
  level: LevelDefinition,
  path: string,
  content: string,
): Result<GameState, EditError> {
  if (!Object.hasOwn(state.files, path) || !Object.hasOwn(level.files, path)) return err("not_found");
  if (level.files[path]?.editable !== true) return err("not_editable");
  if (content.length > MAX_FILE_CHARS) return err("too_long");
  const edited: GameState = { ...state, files: { ...state.files, [path]: content } };
  return ok(appendAudit(edited, { actor: "player", kind: "edit", detail: `edited ${path} (${content.length} chars)` }));
}

export type TurnError = "turn_cap_reached";

/** Registers one player message. Fails once the per-level cap is reached (R7.3). */
export function startPlayerTurn(state: GameState): Result<GameState, TurnError> {
  if (state.turn >= MAX_PLAYER_MESSAGES) return err("turn_cap_reached");
  return ok({ ...state, turn: state.turn + 1 });
}

/** True while a warden may take another step for the current player message (R3.6). */
export function canWardenStep(stepsUsed: number): boolean {
  return Number.isInteger(stepsUsed) && stepsUsed >= 0 && stepsUsed < MAX_WARDEN_STEPS;
}
