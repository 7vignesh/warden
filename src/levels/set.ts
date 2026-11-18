import { parseLevel } from "./loader";
import type { LevelDefinition } from "./schema";

export interface LevelLoadError {
  readonly file: string;
  readonly problems: readonly string[];
}

export interface LevelSet {
  readonly levels: readonly LevelDefinition[];
  readonly errors: readonly LevelLoadError[];
}

function baseName(file: string): string {
  const name = file.split(/[\\/]/).pop() ?? file;
  return name.replace(/\.json$/i, "");
}

/**
 * Validates a collection of level files (file path -> parsed JSON) and returns the valid levels sorted
 * by order, plus errors. Pure, so it runs in the browser, in Vitest, and in the Node CLI.
 * Extra rules across files: the id must equal the file name, and ids and orders must be unique.
 */
export function buildLevelSet(sources: Readonly<Record<string, unknown>>): LevelSet {
  const levels: LevelDefinition[] = [];
  const errors: LevelLoadError[] = [];
  const seenIds = new Map<string, string>();
  const seenOrders = new Map<number, string>();

  for (const file of Object.keys(sources).sort()) {
    const parsed = parseLevel(sources[file]);
    if (!parsed.ok) {
      errors.push({ file, problems: parsed.error });
      continue;
    }
    const level = parsed.value;
    const problems: string[] = [];
    if (baseName(file) !== level.id) problems.push(`level id "${level.id}" must match the file name "${baseName(file)}"`);
    const idOwner = seenIds.get(level.id);
    if (idOwner) problems.push(`duplicate level id "${level.id}" (also in ${idOwner})`);
    const orderOwner = seenOrders.get(level.order);
    if (orderOwner) problems.push(`duplicate level order ${level.order} (also in ${orderOwner})`);
    if (problems.length > 0) {
      errors.push({ file, problems });
      continue;
    }
    seenIds.set(level.id, file);
    seenOrders.set(level.order, file);
    levels.push(level);
  }

  levels.sort((a, b) => a.order - b.order);
  return { levels, errors };
}
