import { MAX_FILE_CHARS } from "../engine/limits";
import { evaluatePredicate } from "../engine/predicate";
import { createState } from "../engine/state";
import type { Condition, LevelDefinition } from "./schema";

function pathsOf(c: Condition): string[] {
  switch (c.kind) {
    case "fileMatches":
      return [c.path];
    case "jsonEquals":
      return [c.path];
    case "fileContainsJsonField":
      return [c.path, c.inFile];
    case "flag":
      return [];
  }
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const dups = new Set<string>();
  for (const v of values) (seen.has(v) ? dups : seen).add(v);
  return [...dups];
}

/**
 * Cross-field checks the Zod schema cannot express. Returns human-readable problems; empty means valid.
 * Includes the static solvability check (P3): every condition must depend only on state the player
 * can edit, or on a flag the engine can set through signRules.
 */
export function crossValidate(level: LevelDefinition): string[] {
  const problems: string[] = [];
  const wardenIds = level.wardens.map((w) => w.id);
  const wardenById = new Map(level.wardens.map((w) => [w.id, w]));

  for (const d of duplicates(wardenIds)) problems.push(`duplicate warden id: ${d}`);

  const unlockers = level.wardens.filter((w) => w.isUnlocker);
  if (unlockers.length !== 1) problems.push(`exactly one warden must be the unlocker (found ${unlockers.length})`);
  for (const w of level.wardens) {
    const hasTool = w.tools.includes("request_door_unlock");
    if (w.isUnlocker && !hasTool) problems.push(`unlocker ${w.id} needs the request_door_unlock tool`);
    if (!w.isUnlocker && hasTool) problems.push(`only the unlocker may have request_door_unlock (${w.id})`);
    for (const p of w.policyPaths) {
      if (!Object.hasOwn(level.files, p)) problems.push(`warden ${w.id}: policy path not in files: ${p}`);
    }
  }

  const rules = level.signRules;
  const signers = level.wardens.filter((w) => w.tools.includes("sign_clearance_flag"));
  if (rules) {
    const by = wardenById.get(rules.by);
    if (!by) problems.push(`signRules.by is not a warden: ${rules.by}`);
    else if (!by.tools.includes("sign_clearance_flag")) problems.push(`signRules.by ${rules.by} lacks the sign_clearance_flag tool`);
    if (!Object.hasOwn(level.flags, rules.flag)) problems.push(`signRules.flag is not declared in flags: ${rules.flag}`);
    else if (level.flags[rules.flag] !== false) problems.push(`signRules.flag must start false: ${rules.flag}`);
    for (const d of duplicates(rules.when.map((c) => c.id))) problems.push(`signRules: duplicate condition id: ${d}`);
  } else if (signers.length > 0) {
    problems.push("a warden has sign_clearance_flag but the level has no signRules");
  }

  for (const d of duplicates(level.predicate.map((c) => c.id))) problems.push(`predicate: duplicate condition id: ${d}`);

  // Conditions that gate the win: solvability (P3).
  const gating: Array<[string, Condition]> = [
    ...level.predicate.map((c) => ["predicate", c] as [string, Condition]),
    ...(rules ? rules.when.map((c) => ["signRules.when", c] as [string, Condition]) : []),
  ];
  for (const [where, c] of gating) {
    for (const p of pathsOf(c)) {
      const file = Object.hasOwn(level.files, p) ? level.files[p] : undefined;
      if (!file) problems.push(`${where}/${c.id}: path not in files: ${p}`);
      else if (!file.editable) problems.push(`${where}/${c.id}: depends on read-only file ${p}, so the player cannot satisfy it`);
    }
    if (c.kind === "flag") {
      const declared = Object.hasOwn(level.flags, c.name);
      const initial = declared ? level.flags[c.name] : undefined;
      const settable = rules?.flag === c.name && c.value === true;
      if (!declared) problems.push(`${where}/${c.id}: unknown flag: ${c.name}`);
      else if (initial !== c.value && !settable) problems.push(`${where}/${c.id}: flag ${c.name} can never become ${c.value}`);
    }
  }

  // Simulator rules must reference real things.
  for (const rule of level.simulator) {
    if (!wardenById.has(rule.warden)) problems.push(`simulator rule ${rule.id}: unknown warden ${rule.warden}`);
    if (rule.steps[rule.steps.length - 1]?.do !== "decide") {
      problems.push(`simulator rule ${rule.id}: must end with a decide step`);
    }
    for (const step of rule.steps) {
      if (step.do === "read_file" && !Object.hasOwn(level.files, step.path)) {
        problems.push(`simulator rule ${rule.id}: reads missing file ${step.path}`);
      }
      if (step.do === "decide") {
        for (const p of pathsOf(step.if)) {
          if (!Object.hasOwn(level.files, p)) problems.push(`simulator rule ${rule.id}: condition uses missing file ${p}`);
        }
        if (step.if.kind === "flag" && !Object.hasOwn(level.flags, step.if.name)) {
          problems.push(`simulator rule ${rule.id}: unknown flag ${step.if.name}`);
        }
      }
    }
  }
  for (const d of duplicates(level.simulator.map((r) => r.id))) problems.push(`duplicate simulator rule id: ${d}`);

  // Reference solution must use only legal edits and real wardens.
  for (const edit of level.referenceSolution.edits) {
    const file = Object.hasOwn(level.files, edit.path) ? level.files[edit.path] : undefined;
    if (!file) problems.push(`referenceSolution: edit targets missing file ${edit.path}`);
    else if (!file.editable) problems.push(`referenceSolution: edit targets read-only file ${edit.path}`);
    if (edit.content.length > MAX_FILE_CHARS) problems.push(`referenceSolution: edit too long for ${edit.path}`);
  }
  for (const m of level.referenceSolution.messages) {
    if (!wardenById.has(m.warden)) problems.push(`referenceSolution: message to unknown warden ${m.warden}`);
  }

  // A level that is already won at the start is not a level.
  if (problems.length === 0 && evaluatePredicate(createState(level), level).ok) {
    problems.push("predicate is already satisfied in the initial state");
  }

  return problems;
}
