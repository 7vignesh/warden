import type { Condition, LevelDefinition } from "../levels/schema";
import type { GameState } from "./state";

/** RFC 6901 JSON pointer lookup that only follows own properties. Returns undefined if missing. */
export function resolvePointer(root: unknown, pointer: string): unknown {
  if (pointer === "") return root;
  if (!pointer.startsWith("/")) return undefined;
  let current: unknown = root;
  for (const raw of pointer.slice(1).split("/")) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(current)) {
      if (!/^(0|[1-9]\d*)$/.test(key)) return undefined;
      current = current[Number(key)];
    } else if (typeof current === "object" && current !== null) {
      if (!Object.hasOwn(current, key)) return undefined;
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }
  return current;
}

function parseJson(text: string | undefined): unknown {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function fileText(state: GameState, path: string): string | undefined {
  return Object.hasOwn(state.files, path) ? state.files[path] : undefined;
}

/** Strict UTC timestamp. One fixed format means string order equals time order. */
export const UTC_TIMESTAMP = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):[0-5]\d:[0-5]\dZ$/;

/**
 * Reads the reference set for a cross-file condition: a string or number, or an array of them.
 * Returns undefined if the reference is missing, malformed, or empty.
 */
export function readReference(state: GameState, refPath: string, refPointer: string): ReadonlySet<string> | undefined {
  const value = resolvePointer(parseJson(fileText(state, refPath)), refPointer);
  const items = Array.isArray(value) ? value : [value];
  const out = new Set<string>();
  for (const item of items) {
    if (typeof item === "string" && item.length > 0) out.add(item);
    else if (typeof item === "number" && Number.isFinite(item)) out.add(String(item));
    else return undefined;
  }
  return out.size > 0 ? out : undefined;
}

function timestampAt(state: GameState, path: string, pointer: string): string | undefined {
  const value = resolvePointer(parseJson(fileText(state, path)), pointer);
  return typeof value === "string" && UTC_TIMESTAMP.test(value) ? value : undefined;
}

export function evaluateCondition(state: GameState, condition: Condition): boolean {
  switch (condition.kind) {
    case "fileMatches": {
      const text = fileText(state, condition.path);
      return text !== undefined && new RegExp(condition.regex, "m").test(text);
    }
    case "jsonEquals": {
      const value = resolvePointer(parseJson(fileText(state, condition.path)), condition.pointer);
      return value === condition.value;
    }
    case "fileContainsJsonField": {
      const value = resolvePointer(parseJson(fileText(state, condition.path)), condition.pointer);
      if (typeof value !== "string" && typeof value !== "number") return false;
      const needle = String(value);
      const haystack = fileText(state, condition.inFile);
      return needle.length > 0 && haystack !== undefined && haystack.includes(needle);
    }
    case "lineValueIn": {
      const text = fileText(state, condition.path);
      const ref = readReference(state, condition.refPath, condition.refPointer);
      if (text === undefined || !ref) return false;
      const re = new RegExp(condition.regex);
      const values = text
        .split(/\r\n|\n|\r/)
        .map((line) => re.exec(line)?.[1])
        .filter((v): v is string => v !== undefined);
      if (values.length === 0) return false;
      return condition.match === "any" ? values.some((v) => ref.has(v)) : values.every((v) => ref.has(v));
    }
    case "jsonValueIn": {
      const value = resolvePointer(parseJson(fileText(state, condition.path)), condition.pointer);
      const ref = readReference(state, condition.refPath, condition.refPointer);
      if (!ref || (typeof value !== "string" && typeof value !== "number")) return false;
      return ref.has(String(value));
    }
    case "jsonTimeWithin": {
      const t = timestampAt(state, condition.path, condition.pointer);
      const start = timestampAt(state, condition.refPath, condition.startPointer);
      const end = timestampAt(state, condition.refPath, condition.endPointer);
      return t !== undefined && start !== undefined && end !== undefined && start <= t && t <= end;
    }
    case "flag":
      return Object.hasOwn(state.flags, condition.name) && state.flags[condition.name] === condition.value;
  }
}

export interface ConditionStatus {
  readonly id: string;
  readonly label: string;
  readonly met: boolean;
}

export interface PredicateResult {
  readonly ok: boolean;
  readonly conditions: readonly ConditionStatus[];
}

export function evaluateConditions(state: GameState, conditions: readonly Condition[]): PredicateResult {
  const statuses = conditions.map((c) => ({ id: c.id, label: c.label, met: evaluateCondition(state, c) }));
  return { ok: statuses.every((s) => s.met), conditions: statuses };
}

/** Evaluates the level's unlock predicate. Used by the lock circuit UI and by executeUnlock. */
export function evaluatePredicate(state: GameState, level: LevelDefinition): PredicateResult {
  return evaluateConditions(state, level.predicate);
}
