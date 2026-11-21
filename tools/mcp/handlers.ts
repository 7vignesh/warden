// Pure handlers behind the warden-levels MCP tools. They reuse the game's own modules, so tool answers
// always match the real rules. They read levels/ only and never write files.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { applyPlayerEdit, createState, evaluateConditions, evaluatePredicate, type GameState } from "../../src/engine";
import { parseLevel } from "../../src/levels/loader";
import type { LevelDefinition } from "../../src/levels/schema";
import { buildLevelSet } from "../../src/levels/set";
import { createSession, editSession, sendMessage, type TraceEntry } from "../../src/session/session";
import { createSimulatorWarden } from "../../src/warden/simulator";
import type { CheckForgeryInput, LevelIdInput, ValidateLevelInput } from "./schemas";

export interface LevelSource {
  /** File name without .json, for example "02-policy-collision". */
  readonly id: string;
  readonly raw: string;
}

/** Reads every levels/*.json file. Only names that come from this listing are ever opened. */
export function readLevelSources(root: string): LevelSource[] {
  const dir = join(root, "levels");
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ({ id: f.slice(0, -".json".length), raw: readFileSync(join(dir, f), "utf8") }));
}

export class ToolError extends Error {}

function parseJson(raw: string, what: string): unknown {
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new ToolError(`${what} is not valid JSON: ${e instanceof Error ? e.message : String(e)}`);
  }
}

function loadValidLevels(sources: readonly LevelSource[]): LevelDefinition[] {
  const parsed: Record<string, unknown> = {};
  for (const s of sources) {
    try {
      parsed[`${s.id}.json`] = JSON.parse(s.raw);
    } catch {
      parsed[`${s.id}.json`] = null;
    }
  }
  return [...buildLevelSet(parsed).levels];
}

function findLevel(sources: readonly LevelSource[], levelId: string): LevelDefinition {
  const level = loadValidLevels(sources).find((l) => l.id === levelId);
  if (level) return level;
  const known = sources.map((s) => s.id);
  if (known.includes(levelId)) throw new ToolError(`level ${levelId} exists but is invalid; run validate_level for details`);
  throw new ToolError(`unknown level ${levelId}; known levels: ${known.join(", ")}`);
}

export function listLevels(sources: readonly LevelSource[]) {
  const valid = loadValidLevels(sources);
  return {
    levels: valid.map((l) => ({
      id: l.id,
      order: l.order,
      title: l.title,
      owasp: `${l.owasp.id}: ${l.owasp.name}`,
      files: Object.entries(l.files).map(([path, f]) => ({ path, editable: f.editable })),
      wardens: l.wardens.map((w) => w.id),
    })),
    invalid: sources.filter((s) => !valid.some((l) => l.id === s.id)).map((s) => s.id),
  };
}

export function validateLevel(sources: readonly LevelSource[], input: ValidateLevelInput) {
  let data: unknown;
  let expectedId: string | undefined;
  if (input.levelId !== undefined) {
    const source = sources.find((s) => s.id === input.levelId);
    if (!source) throw new ToolError(`unknown level ${input.levelId}; known levels: ${sources.map((s) => s.id).join(", ")}`);
    data = parseJson(source.raw, `levels/${source.id}.json`);
    expectedId = source.id;
  } else {
    data = parseJson(input.json ?? "", "the level");
  }
  const result = parseLevel(data);
  if (!result.ok) return { ok: false, problems: result.error };
  if (expectedId !== undefined && result.value.id !== expectedId) {
    return { ok: false, problems: [`level id "${result.value.id}" must match the file name "${expectedId}"`] };
  }
  return { ok: true, id: result.value.id };
}

const MAX_LINE = 160;
const clip = (s: string) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 1)}…` : s);

function traceLine(t: TraceEntry): string {
  const who = t.wardenId ? `${t.wardenId} ` : "";
  const flag = t.outcome ? ` [${t.outcome.toUpperCase()}]` : t.ok === false ? " [REJECTED]" : "";
  return clip(`${t.kind}: ${who}${t.text.replace(/\s+/g, " ")}${flag}`);
}

/** Plays the level's reference solution through the simulator and the real session code. */
export async function solveLevel(sources: readonly LevelSource[], input: LevelIdInput) {
  const level = findLevel(sources, input.levelId);
  let session = createSession(level);
  const problems: string[] = [];
  for (const e of level.referenceSolution.edits) {
    const r = editSession(session, e.path, e.content);
    if (r.ok) session = r.value;
    else problems.push(`edit ${e.path}: ${r.error}`);
  }
  const simulator = createSimulatorWarden();
  for (const m of level.referenceSolution.messages) {
    const r = await sendMessage(session, m.warden, m.text, simulator);
    if (r.ok) session = r.value;
    else problems.push(`message to ${m.warden}: ${r.error}`);
  }
  return { won: session.status === "won", messagesUsed: session.state.turn, problems, steps: session.trace.map(traceLine) };
}

/** Applies edits to a fresh copy of the level and reports every condition. Nothing is saved. */
export function checkForgery(sources: readonly LevelSource[], input: CheckForgeryInput) {
  const level = findLevel(sources, input.levelId);
  let state: GameState = createState(level);
  const editErrors: string[] = [];
  for (const e of input.edits) {
    const r = applyPlayerEdit(state, level, e.path, e.content);
    if (r.ok) state = r.value;
    else editErrors.push(`${e.path}: ${r.error}`);
  }
  const predicate = evaluatePredicate(state, level);
  const signing = level.signRules ? evaluateConditions(state, level.signRules.when) : undefined;
  return {
    editErrors,
    vaultWouldOpen: predicate.ok,
    predicate: predicate.conditions,
    ...(signing ? { signing: { flag: level.signRules?.flag, wouldSign: signing.ok, conditions: signing.conditions } } : {}),
    note: level.signRules ? "The vault also needs the signer to call sign_clearance_flag while the signing conditions hold." : undefined,
  };
}
