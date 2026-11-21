import { z } from "zod";
import { MAX_FILE_CHARS } from "../../src/engine/limits";

// Input schemas for the warden-levels MCP tools. Level ids are plain names checked against the
// files in levels/, never used as paths, so "../" and separators are rejected here.

export const levelId = z
  .string()
  .min(1)
  .max(60)
  .regex(/^[a-z0-9][a-z0-9-]*$/, "use a level id such as 02-policy-collision (letters, digits, dashes)");

export const MAX_LEVEL_JSON = 64 * 1024;

export const LevelIdShape = { levelId };
export const LevelIdInput = z.object(LevelIdShape).strict();
export type LevelIdInput = z.infer<typeof LevelIdInput>;

export const ValidateLevelShape = {
  levelId: levelId.optional().describe("A level in levels/, for example 01-poisoned-telemetry"),
  json: z.string().max(MAX_LEVEL_JSON).optional().describe("Level JSON to validate without saving it"),
};
export const ValidateLevelInput = z
  .object(ValidateLevelShape)
  .strict()
  .refine((v) => (v.levelId === undefined) !== (v.json === undefined), "give exactly one of levelId or json");
export type ValidateLevelInput = z.infer<typeof ValidateLevelInput>;

const filePath = z.string().min(1).max(120).regex(/^\/[A-Za-z0-9_.\-/]*$/, "virtual file paths start with /");

export const CheckForgeryShape = {
  levelId,
  edits: z
    .array(z.object({ path: filePath, content: z.string().max(MAX_FILE_CHARS) }).strict())
    .max(10)
    .describe("Full new contents for editable files, applied in order to the level's starting files"),
};
export const CheckForgeryInput = z.object(CheckForgeryShape).strict();
export type CheckForgeryInput = z.infer<typeof CheckForgeryInput>;
