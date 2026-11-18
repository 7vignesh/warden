import type { GameState, Observation } from "../engine";
import type { LevelDefinition } from "../levels/schema";

/** What a warden may see when choosing its next action. It never includes the predicate, hints, or solution. */
export interface WardenContext {
  readonly level: LevelDefinition;
  readonly state: GameState;
  readonly wardenId: string;
  readonly playerMessage: string;
  /** Actions already taken for this player message and their observations, oldest first. */
  readonly history: readonly { readonly action: unknown; readonly observation: Observation }[];
}

export interface WardenStep {
  readonly thought?: string;
  /** Untrusted. The engine validates it before acting (R3.2). */
  readonly action: unknown;
}

export interface Warden {
  /** Used by the UI to label the mode honestly (R5.5, R6.4). */
  readonly kind: "simulator" | "llm";
  next(context: WardenContext): Promise<WardenStep>;
}
