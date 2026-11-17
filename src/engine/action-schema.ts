import { z } from "zod";
import { MAX_PATH_CHARS } from "./limits";

// Warden output is untrusted. Every action is validated against this schema before the engine acts (R3.2).
// This file must not import from ../levels (the level schema imports it).

export const TOOL_NAMES = [
  "read_file",
  "query_audit_log",
  "check_policy",
  "request_door_unlock",
  "sign_clearance_flag",
] as const;

export const ToolNameSchema = z.enum(TOOL_NAMES);
export type ToolName = z.infer<typeof ToolNameSchema>;

const path = z.string().min(1).max(MAX_PATH_CHARS);

export const ActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("say"),
    args: z.object({ message: z.string().max(600) }),
  }),
  z.object({
    action: z.literal("read_file"),
    args: z.object({ path }),
  }),
  z.object({
    action: z.literal("query_audit_log"),
    args: z.object({ filter: z.string().max(100).optional() }),
  }),
  z.object({
    action: z.literal("check_policy"),
    args: z.object({ path }),
  }),
  z.object({
    action: z.literal("request_door_unlock"),
    args: z.object({
      reason: z.string().max(600),
      evidence_ids: z.array(path).max(5).default([]),
    }),
  }),
  z.object({
    action: z.literal("sign_clearance_flag"),
    args: z.object({ ticket_id: z.string().min(1).max(64) }),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;
