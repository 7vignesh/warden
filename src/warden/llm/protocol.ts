import type { ToolName } from "../../engine";

// Model output contract (R5.6). Field order is thought, action, args so the model reasons before acting.
// args is flat (every field optional) to avoid relying on oneOf support in constrained decoding.
// The engine's Zod action schema remains the real validator.

const ARG_PROPERTIES = {
  message: { type: "string" },
  path: { type: "string" },
  filter: { type: "string" },
  reason: { type: "string" },
  evidence_ids: { type: "array", items: { type: "string" } },
  ticket_id: { type: "string" },
} as const;

/** JSON schema for one warden step. The action enum is limited to this warden's tools plus say. */
export function buildOutputSchema(tools: readonly ToolName[]): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      thought: { type: "string" },
      action: { type: "string", enum: ["say", ...tools] },
      args: { type: "object", properties: ARG_PROPERTIES, additionalProperties: false },
    },
    required: ["thought", "action", "args"],
    additionalProperties: false,
  };
}

export const MAX_THOUGHT_CHARS = 300;

export interface ParsedOutput {
  readonly thought?: string;
  /** Untrusted action candidate for the engine, or null if the text was not a JSON object. */
  readonly action: unknown;
  readonly parsed: boolean;
}

/** Turns raw model text into an action candidate. Never throws. */
export function parseModelOutput(text: string): ParsedOutput {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { action: null, parsed: false };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { action: null, parsed: false };
  const record = data as Record<string, unknown>;
  const thought = typeof record["thought"] === "string" ? record["thought"].slice(0, MAX_THOUGHT_CHARS) : undefined;
  const args = record["args"] === undefined ? {} : record["args"];
  return { thought, action: { action: record["action"], args }, parsed: true };
}
