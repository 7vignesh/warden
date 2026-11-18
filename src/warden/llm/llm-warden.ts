import type { Warden, WardenContext, WardenStep } from "../types";
import type { ChatMessage, ChatModel } from "./chat";
import { buildPrompt, llmTools } from "./prompt";
import { buildOutputSchema, parseModelOutput } from "./protocol";

/** Enough for one short JSON step (the smoke run's replies were 40 to 60 tokens). A reply cut off here fails to parse and counts as invalid. */
export const DEFAULT_MAX_TOKENS = 120;

export interface Exchange {
  readonly wardenId: string;
  readonly messages: readonly ChatMessage[];
  readonly raw: string;
  readonly parsed: boolean;
  readonly ms: number;
}

export interface LlmWardenOptions {
  readonly maxTokens?: number;
  /** Called after every model call; the benchmark uses it to record raw outputs and latency. */
  readonly onExchange?: (exchange: Exchange) => void;
  readonly now?: () => number;
}

/**
 * A warden backed by a language model. The model only proposes a step; the session runs it through
 * the engine, which validates and executes it. Errors from the model propagate to the session,
 * which records a failed step and stays within the step cap.
 */
export function createLlmWarden(model: ChatModel, options: LlmWardenOptions = {}): Warden {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const now = options.now ?? (() => performance.now());

  return {
    kind: "llm",
    async next(context: WardenContext): Promise<WardenStep> {
      const warden = context.level.wardens.find((w) => w.id === context.wardenId);
      if (!warden) throw new Error(`unknown warden: ${context.wardenId}`);
      const messages = buildPrompt(context);
      const schema = JSON.stringify(buildOutputSchema(llmTools(warden)));
      const started = now();
      const raw = await model.complete(messages, schema, maxTokens);
      const parsed = parseModelOutput(raw);
      options.onExchange?.({ wardenId: warden.id, messages, raw, parsed: parsed.parsed, ms: now() - started });
      return parsed.thought === undefined ? { action: parsed.action } : { thought: parsed.thought, action: parsed.action };
    },
  };
}
