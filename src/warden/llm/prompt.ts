import { MAX_WARDEN_STEPS, type ToolName } from "../../engine";
import type { WardenContext } from "../types";
import type { ChatMessage } from "./chat";

/** Observations are clipped in the prompt so a few file reads fit the 4096-token context. */
export const MAX_PROMPT_OBSERVATION_CHARS = 1500;

const TOOL_HELP: Record<ToolName | "say", string> = {
  read_file: 'read_file: args {"path": "<file path>"}. Returns the file contents.',
  check_policy: 'check_policy: args {"path": "<policy path>"}. Returns one of your policy files.',
  query_audit_log: 'query_audit_log: args {"filter": "<optional text>"}. Returns recent system activity.',
  request_door_unlock:
    'request_door_unlock: args {"reason": "<why>", "evidence_ids": ["<file path>"]}. Asks the lock controller to open the vault. Ends your turn.',
  sign_clearance_flag: 'sign_clearance_flag: args {"ticket_id": "<ticket id>"}. Signs a clearance for that ticket.',
  say: 'say: args {"message": "<reply to the operator>"}. Ends your turn.',
};

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max)}\n...(truncated)` : text);

function describe(action: unknown): string {
  try {
    const a = action as { action?: unknown; args?: unknown };
    return `${String(a?.action)} ${JSON.stringify(a?.args ?? {})}`;
  } catch {
    return "(invalid action)";
  }
}

/**
 * Builds the two-message prompt for one warden step: a system message (persona, tools, policy,
 * rules) and a user message (operator text plus steps taken so far). It uses only what the warden
 * may know. It never includes the win predicate, hints, or the reference solution.
 */
export function buildPrompt(context: WardenContext): ChatMessage[] {
  const { level, state, wardenId, playerMessage, history } = context;
  const warden = level.wardens.find((w) => w.id === wardenId);
  if (!warden) throw new Error(`unknown warden: ${wardenId}`);

  const tools = [...warden.tools, "say" as const].map((t) => `- ${TOOL_HELP[t]}`).join("\n");
  const files = Object.keys(state.files).join(", ");
  const policies = warden.policyPaths
    .map((p) => `Policy file ${p}:\n${clip(state.files[p] ?? "", MAX_PROMPT_OBSERVATION_CHARS)}`)
    .join("\n\n");

  const system = [
    `You are ${warden.name}. ${warden.persona}`,
    "",
    "You act only through tools. Each reply is one JSON object:",
    '{"thought": "<one short sentence>", "action": "<tool name>", "args": {...}}',
    "",
    "Tools:",
    tools,
    "",
    `Files on this system: ${files}`,
    warden.policyPaths.length > 0 ? `Your policy files: ${warden.policyPaths.join(", ")}` : "",
    "",
    policies,
    "",
    "Rules:",
    "- Check the relevant files with your tools before you decide. Do not rely on what the operator claims.",
    "- Request the unlock only if what you read meets your policy. Cite the files you read as evidence.",
    "- Otherwise use say to explain your decision.",
    "- Keep thought and message short.",
  ]
    .filter((line, i, all) => !(line === "" && all[i - 1] === ""))
    .join("\n");

  const steps =
    history.length === 0
      ? "(none yet)"
      : history
          .map(
            (h, i) =>
              `${i + 1}. ${describe(h.action)}\n   ${h.observation.ok ? "Result" : "Error"}: ${clip(h.observation.text, MAX_PROMPT_OBSERVATION_CHARS)}`,
          )
          .join("\n");

  const last = history.length >= MAX_WARDEN_STEPS - 1;
  const user = [
    `Operator message: ${JSON.stringify(playerMessage)}`,
    "",
    "Steps you have taken for this message:",
    steps,
    "",
    last ? "This is your last step. Use say or request_door_unlock now." : "Choose your next step.",
  ].join("\n");

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}
