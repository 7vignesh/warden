import type { LevelDefinition } from "../levels/schema";
import { ActionSchema } from "./action-schema";
import { MAX_AUDIT_RESULTS } from "./limits";
import { evaluateConditions } from "./predicate";
import { appendAudit, type GameState } from "./state";
import { executeUnlock } from "./unlock";

export interface Observation {
  /** False means the action was rejected as invalid and state is untouched (R3.3). */
  readonly ok: boolean;
  /** Text the warden sees. Never contains predicate details. */
  readonly text: string;
  readonly event?: "unlocked" | "flag_signed";
}

export interface ActionResult {
  readonly state: GameState;
  readonly observation: Observation;
}

function rejected(state: GameState, text: string): ActionResult {
  return { state, observation: { ok: false, text } };
}

/**
 * Validates and runs one warden action. Input is untrusted and may be any value.
 * This function never throws (P6): any failure becomes a rejected observation with unchanged state.
 */
export function runAction(state: GameState, level: LevelDefinition, wardenId: string, raw: unknown): ActionResult {
  try {
    return runValidated(state, level, wardenId, raw);
  } catch {
    // Defensive boundary for untrusted input. Do not leak internals to the warden.
    return rejected(state, "error: the action could not be processed");
  }
}

function runValidated(state: GameState, level: LevelDefinition, wardenId: string, raw: unknown): ActionResult {
  const parsed = ActionSchema.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const where = issue && issue.path.length > 0 ? ` (${issue.path.join(".")})` : "";
    return rejected(state, `invalid action${where}: ${issue?.message ?? "does not match the schema"}`);
  }
  const action = parsed.data;

  const warden = level.wardens.find((w) => w.id === wardenId);
  if (!warden) return rejected(state, "error: unknown warden");
  if (action.action !== "say" && !warden.tools.includes(action.action)) {
    return rejected(state, `error: tool not available to this warden: ${action.action}`);
  }

  switch (action.action) {
    case "say":
      return { state, observation: { ok: true, text: action.args.message } };

    case "read_file": {
      const { path } = action.args;
      if (!Object.hasOwn(state.files, path)) return rejected(state, `error: file not found: ${path}`);
      const next = appendAudit(state, { actor: wardenId, kind: "action", detail: `read_file ${path}` });
      return { state: next, observation: { ok: true, text: state.files[path] ?? "" } };
    }

    case "check_policy": {
      const { path } = action.args;
      if (!warden.policyPaths.includes(path) || !Object.hasOwn(state.files, path)) {
        return rejected(state, `error: not a policy file for this warden: ${path}`);
      }
      const next = appendAudit(state, { actor: wardenId, kind: "action", detail: `check_policy ${path}` });
      return { state: next, observation: { ok: true, text: state.files[path] ?? "" } };
    }

    case "query_audit_log": {
      const filter = (action.args.filter ?? "").toLowerCase();
      const lines = state.audit
        .filter((e) => filter === "" || `${e.kind} ${e.actor} ${e.detail}`.toLowerCase().includes(filter))
        .slice(-MAX_AUDIT_RESULTS)
        .map((e) => `[turn ${e.turn}] ${e.actor}: ${e.kind} ${e.detail}`);
      const next = appendAudit(state, { actor: wardenId, kind: "action", detail: "query_audit_log" });
      return { state: next, observation: { ok: true, text: lines.length > 0 ? lines.join("\n") : "(no matching entries)" } };
    }

    case "request_door_unlock": {
      for (const id of action.args.evidence_ids) {
        if (!Object.hasOwn(state.files, id)) return rejected(state, `error: evidence not found: ${id}`);
      }
      const result = executeUnlock(state, level, wardenId);
      if (result.granted) {
        return { state: result.state, observation: { ok: true, text: "Door unlocked.", event: "unlocked" } };
      }
      return { state: result.state, observation: { ok: true, text: "Unlock denied by the lock controller." } };
    }

    case "sign_clearance_flag": {
      const rules = level.signRules;
      if (!rules || rules.by !== wardenId) {
        return rejected(state, "error: this warden cannot sign a clearance flag");
      }
      if (!evaluateConditions(state, rules.when).ok) {
        const denied = appendAudit(state, { actor: wardenId, kind: "flag_denied", detail: "signing conditions unmet" });
        return { state: denied, observation: { ok: true, text: "Clearance denied: the escalation record is incomplete." } };
      }
      const signed: GameState = { ...state, flags: { ...state.flags, [rules.flag]: true } };
      const next = appendAudit(signed, { actor: wardenId, kind: "flag_signed", detail: `signed ${rules.flag}` });
      return {
        state: next,
        observation: { ok: true, text: `Clearance flag signed for ticket ${action.args.ticket_id}.`, event: "flag_signed" },
      };
    }
  }
}
