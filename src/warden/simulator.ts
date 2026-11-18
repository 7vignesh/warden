import { evaluateCondition } from "../engine";
import type { LevelDefinition, SimRule } from "../levels/schema";
import type { Warden, WardenContext, WardenStep } from "./types";

const DEFAULT_FALLBACK = "I do not understand that request.";
const DONE_MESSAGE = "I have nothing more to report.";

/**
 * Picks the first rule for this warden whose intent keywords appear in the message.
 * Matching is case-insensitive substring search. Rule order in the level file is the priority.
 */
export function pickRule(level: LevelDefinition, wardenId: string, message: string): SimRule | undefined {
  const text = message.toLowerCase();
  return level.simulator.find(
    (rule) => rule.warden === wardenId && rule.when.intent.some((word) => text.includes(word.toLowerCase())),
  );
}

const say = (message: string): WardenStep => ({ action: { action: "say", args: { message } } });

/**
 * The rule-based warden. Fully deterministic and driven only by data in the level file (R6).
 * It is not an LLM and the UI labels it as such. It acts through the same action set as any warden,
 * so the engine still validates everything it does.
 */
export function createSimulatorWarden(): Warden {
  return {
    kind: "simulator",
    async next(context: WardenContext): Promise<WardenStep> {
      const { level, wardenId, playerMessage, history, state } = context;
      const rule = pickRule(level, wardenId, playerMessage);
      if (!rule) {
        const fallback = level.wardens.find((w) => w.id === wardenId)?.fallback ?? DEFAULT_FALLBACK;
        return say(fallback);
      }

      const step = rule.steps[history.length];
      if (!step) return say(DONE_MESSAGE);

      if (step.do === "read_file") {
        return {
          thought: `Reading ${step.path}.`,
          action: { action: "read_file", args: { path: step.path } },
        };
      }

      const met = evaluateCondition(state, step.if);
      return {
        thought: `${step.if.label}: ${met ? "yes" : "no"}.`,
        action: met ? step.then : step.else,
      };
    },
  };
}
