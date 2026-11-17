import { err, ok, type Result } from "../engine/result";
import { LevelSchema, type LevelDefinition } from "./schema";
import { crossValidate } from "./validate";

const MAX_REPORTED = 12;

/**
 * Parses and validates an untrusted level object. Never throws; returns readable errors instead (R4.2).
 * Passing means: schema valid, cross-field rules hold, and the level is statically solvable (P3).
 */
export function parseLevel(input: unknown): Result<LevelDefinition, string[]> {
  try {
    const parsed = LevelSchema.safeParse(input);
    if (!parsed.success) {
      const messages = parsed.error.issues
        .slice(0, MAX_REPORTED)
        .map((i) => `${i.path.length > 0 ? i.path.join(".") : "(root)"}: ${i.message}`);
      return err(messages);
    }
    const problems = crossValidate(parsed.data);
    if (problems.length > 0) return err(problems.slice(0, MAX_REPORTED));
    return ok(parsed.data);
  } catch {
    return err(["level could not be processed"]);
  }
}
