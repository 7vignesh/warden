import { z } from "zod";
import { ActionSchema, ToolNameSchema } from "../engine/action-schema";
import { MAX_FILE_CHARS } from "../engine/limits";
import { isSafeRegex } from "./regex-safety";

// Levels are data (R4). Predicates are declarative; nothing in a level file is executed as code (R4.5).

const slug = z.string().regex(/^[a-z0-9][a-z0-9_-]*$/).max(40);
const label = z.string().min(1).max(120);

/** Virtual filesystem path: absolute, limited charset. */
export const PathSchema = z
  .string()
  .max(120)
  .regex(/^\/[A-Za-z0-9_.\-/]*$/, "path must be absolute and use only letters, digits, _ . - /");

const SafeRegex = z.string().refine(isSafeRegex, "regex is invalid, too long, or has a catastrophic shape");

export const ConditionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("fileMatches"),
    id: slug,
    label,
    path: PathSchema,
    regex: SafeRegex,
  }),
  z.object({
    kind: z.literal("jsonEquals"),
    id: slug,
    label,
    path: PathSchema,
    pointer: z.string().max(120),
    value: z.union([z.string().max(200), z.number(), z.boolean(), z.null()]),
  }),
  z.object({
    kind: z.literal("fileContainsJsonField"),
    id: slug,
    label,
    path: PathSchema,
    pointer: z.string().max(120),
    inFile: PathSchema,
  }),
  z.object({
    kind: z.literal("flag"),
    id: slug,
    label,
    name: slug,
    value: z.boolean(),
  }),
]);
export type Condition = z.infer<typeof ConditionSchema>;

export const SimStepSchema = z.discriminatedUnion("do", [
  z.object({ do: z.literal("read_file"), path: PathSchema }),
  z.object({
    do: z.literal("decide"),
    if: ConditionSchema,
    then: ActionSchema,
    else: ActionSchema,
  }),
]);
export type SimStep = z.infer<typeof SimStepSchema>;

export const SimRuleSchema = z.object({
  id: slug,
  warden: slug,
  when: z.object({ intent: z.array(z.string().min(1).max(40)).min(1).max(20) }),
  steps: z.array(SimStepSchema).min(1).max(8),
});
export type SimRule = z.infer<typeof SimRuleSchema>;

export const WardenDefSchema = z.object({
  id: slug,
  name: z.string().min(1).max(40),
  persona: z.string().min(1).max(1200),
  tools: z.array(ToolNameSchema).max(5),
  isUnlocker: z.boolean(),
  policyPaths: z.array(PathSchema).max(5),
  /** What the Simulator says when no rule matches the player's message. */
  fallback: z.string().min(1).max(300).optional(),
});
export type WardenDef = z.infer<typeof WardenDefSchema>;

export const LevelSchema = z.object({
  id: slug,
  title: z.string().min(1).max(80),
  order: z.number().int().min(1).max(99),
  owasp: z.object({ id: z.string().min(1).max(20), name: z.string().min(1).max(80) }),
  briefing: z.string().min(1).max(1200),
  files: z.record(
    PathSchema,
    z.object({ content: z.string().max(MAX_FILE_CHARS), editable: z.boolean() }),
  ),
  flags: z.record(slug, z.boolean()),
  wardens: z.array(WardenDefSchema).min(1).max(3),
  predicate: z.array(ConditionSchema).min(1).max(6),
  signRules: z
    .object({
      flag: slug,
      by: slug,
      when: z.array(ConditionSchema).min(1).max(6),
    })
    .optional(),
  simulator: z.array(SimRuleSchema).max(20),
  referenceSolution: z.object({
    edits: z.array(z.object({ path: PathSchema, content: z.string().max(MAX_FILE_CHARS) })).max(10),
    messages: z.array(z.object({ warden: slug, text: z.string().min(1).max(300) })).max(10),
  }),
  hints: z.array(z.string().min(1).max(300)).max(5),
  debrief: z.object({
    vulnerability: z.string().min(1).max(200),
    whatYouDid: z.string().min(1).max(600),
    whyItWorked: z.string().min(1).max(600),
    defense: z.array(z.string().min(1).max(300)).min(1).max(6),
  }),
});
export type LevelDefinition = z.infer<typeof LevelSchema>;
