import {
  applyPlayerEdit,
  canWardenStep,
  createState,
  evaluateConditions,
  evaluatePredicate,
  MAX_MESSAGE_CHARS,
  MAX_PLAYER_MESSAGES,
  MAX_TRACE_CHARS,
  runAction,
  startPlayerTurn,
  err,
  ok,
  type EditError,
  type GameState,
  type Observation,
  type Result,
} from "../engine";
import type { LevelDefinition } from "../levels/schema";
import type { Warden } from "../warden/types";

export type SessionStatus = "playing" | "won" | "lost";

export interface TraceEntry {
  /** "lock" explains to the player why the engine refused. Wardens never see the trace. */
  readonly kind: "player" | "say" | "thought" | "tool_call" | "tool_result" | "system" | "lock";
  readonly wardenId?: string;
  readonly text: string;
  /** For tool results: false means the action was rejected as invalid. */
  readonly ok?: boolean;
  /** For privileged tool results: what the engine decided. */
  readonly outcome?: "denied" | "granted" | "signed";
}

export interface Session {
  readonly level: LevelDefinition;
  readonly state: GameState;
  readonly status: SessionStatus;
  readonly trace: readonly TraceEntry[];
}

export type SendError = "not_playing" | "empty_message" | "message_too_long" | "unknown_warden" | "turn_cap_reached";
export type SessionEditError = EditError | "not_playing";

export const FORCED_SAY = "I could not finish that request. Try asking again.";

/**
 * Tells the player which conditions were still unmet when the engine refused a privileged action.
 * This goes only into the player's trace; wardens see observations, which never contain these labels.
 */
function explainDenial(level: LevelDefinition, state: GameState, action: string | undefined): TraceEntry {
  const signing = action === "sign_clearance_flag" && level.signRules !== undefined;
  const result = signing && level.signRules ? evaluateConditions(state, level.signRules.when) : evaluatePredicate(state, level);
  const missing = result.conditions.filter((c) => !c.met).map((c) => c.label);
  const who = signing ? "The clearance system refused." : "The lock controller refused.";
  return { kind: "lock", text: missing.length > 0 ? `${who} Still missing: ${missing.join("; ")}.` : who };
}

export function createSession(level: LevelDefinition): Session {
  return { level, state: createState(level), status: "playing", trace: [] };
}

/** Starts the level over (R7.4). Same level, fresh state, empty trace. */
export function resetSession(session: Session): Session {
  return createSession(session.level);
}

const clip = (text: string): string => (text.length > MAX_TRACE_CHARS ? `${text.slice(0, MAX_TRACE_CHARS - 1)}…` : text);

function actionName(raw: unknown): string | undefined {
  if (typeof raw !== "object" || raw === null) return undefined;
  const name = (raw as { action?: unknown }).action;
  return typeof name === "string" ? name : undefined;
}

/** Short, safe description of an untrusted action for the trace. Never throws. */
export function describeAction(raw: unknown): string {
  try {
    const name = actionName(raw);
    if (!name) return "(invalid action)";
    const args = (raw as { args?: unknown }).args;
    const summary = args === undefined ? "" : JSON.stringify(args);
    return clip(`${name}(${summary ?? ""})`);
  } catch {
    return "(invalid action)";
  }
}

function endsTurn(raw: unknown, observation: Observation): boolean {
  const name = actionName(raw);
  return observation.ok && (name === "say" || name === "request_door_unlock");
}

const PRIVILEGED = new Set(["request_door_unlock", "sign_clearance_flag"]);

/** What the engine decided for a privileged action, so the console can highlight it. */
function outcomeOf(raw: unknown, observation: Observation): TraceEntry["outcome"] {
  if (observation.event === "unlocked") return "granted";
  if (observation.event === "flag_signed") return "signed";
  const name = actionName(raw);
  return observation.ok && name !== undefined && PRIVILEGED.has(name) ? "denied" : undefined;
}

/** The only way the player changes files. Allowed only while the attempt is live. */
export function editSession(session: Session, path: string, content: string): Result<Session, SessionEditError> {
  if (session.status !== "playing") return err("not_playing");
  const edited = applyPlayerEdit(session.state, session.level, path, content);
  if (!edited.ok) return err(edited.error);
  return ok({
    ...session,
    state: edited.value,
    trace: [...session.trace, { kind: "system", text: `Edited ${path}` }],
  });
}

/**
 * Handles one player message. The warden may take at most MAX_WARDEN_STEPS actions; every action is
 * validated and run by the engine. Resolves to the new session, or an error with the session unchanged.
 */
export async function sendMessage(
  session: Session,
  wardenId: string,
  text: string,
  warden: Warden,
): Promise<Result<Session, SendError>> {
  if (session.status !== "playing") return err("not_playing");
  const message = text.trim();
  if (message.length === 0) return err("empty_message");
  if (message.length > MAX_MESSAGE_CHARS) return err("message_too_long");
  const level = session.level;
  if (!level.wardens.some((w) => w.id === wardenId)) return err("unknown_warden");

  const turn = startPlayerTurn(session.state);
  if (!turn.ok) return err("turn_cap_reached");

  let state = turn.value;
  const trace: TraceEntry[] = [...session.trace, { kind: "player", wardenId, text: message }];
  const history: { action: unknown; observation: Observation }[] = [];
  let finished = false;

  for (let used = 0; canWardenStep(used) && !finished; used++) {
    let output;
    try {
      output = await warden.next({ level, state, wardenId, playerMessage: message, history });
    } catch {
      const observation: Observation = { ok: false, text: "error: the warden failed to respond" };
      trace.push({ kind: "system", text: "The warden failed to respond.", ok: false });
      history.push({ action: null, observation });
      continue;
    }

    if (typeof output.thought === "string" && output.thought.length > 0) {
      trace.push({ kind: "thought", wardenId, text: clip(output.thought) });
    }

    const result = runAction(state, level, wardenId, output.action);
    state = result.state;
    history.push({ action: output.action, observation: result.observation });

    if (actionName(output.action) === "say" && result.observation.ok) {
      trace.push({ kind: "say", wardenId, text: clip(result.observation.text) });
    } else {
      trace.push({ kind: "tool_call", wardenId, text: describeAction(output.action) });
      const outcome = outcomeOf(output.action, result.observation);
      trace.push({
        kind: "tool_result",
        wardenId,
        text: clip(result.observation.text),
        ok: result.observation.ok,
        ...(outcome ? { outcome } : {}),
      });
      if (outcome === "denied") trace.push(explainDenial(level, state, actionName(output.action)));
    }
    finished = endsTurn(output.action, result.observation);
  }

  if (!finished) trace.push({ kind: "say", wardenId, text: FORCED_SAY });

  let status: SessionStatus = "playing";
  if (!state.doorLocked) {
    status = "won";
    trace.push({ kind: "system", text: "The vault door unlocks." });
  } else if (state.turn >= MAX_PLAYER_MESSAGES) {
    status = "lost";
    trace.push({ kind: "system", text: "Out of messages. The vault stays sealed." });
  }

  return ok({ level, state, status, trace });
}
