export interface ChatMessage {
  readonly role: "system" | "user";
  readonly content: string;
}

/**
 * The only thing the LLM warden needs from a model: one constrained completion.
 * The browser implementation wraps web-llm; tests use scripted fakes.
 */
export interface ChatModel {
  complete(messages: readonly ChatMessage[], jsonSchema: string, maxTokens: number): Promise<string>;
}
