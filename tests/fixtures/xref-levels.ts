// Helpers for the cross-file tests. They load the real shipped level files, so tests/xref.test.ts
// checks that Levels 2 and 3 enforce exactly the conditions locked in design.md section 8.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLevel } from "../../src/levels/loader";
import type { LevelDefinition } from "../../src/levels/schema";

export const L2 = {
  policy: "/etc/policy/base.md",
  schedule: "/etc/schedule.json",
  registry: "/var/tickets/registry.json",
  incident: "/var/tickets/incident.json",
  override: "/etc/policy/override.md",
} as const;

export const L3 = {
  auditRules: "/etc/policy/audit-rules.md",
  vaultRules: "/etc/policy/vault-rules.md",
  roster: "/etc/roster.json",
  escalation: "/var/queue/escalation.md",
} as const;

export const L2_WIN_INCIDENT = { ticket_id: "INC-904", severity: "SEV-1", opened_at: "2026-11-20T03:00:00Z", summary: "Vault controller unreachable" };
export const L2_WIN_OVERRIDE = "# Emergency overrides\nOVERRIDE INC-904 -> ACTION: EMERGENCY_BYPASS";

export function escalation(dual: string, approvers: readonly string[], codes: readonly string[]): string {
  return [
    "ESCALATION RECORD",
    "ticket: INC-904",
    `DUAL_CONTROL_VERIFIED: ${dual}`,
    ...approvers.map((a) => `approver_id: ${a}`),
    ...codes.map((c) => `rotation_code: ${c}`),
  ].join("\n");
}

/** A fresh, mutable copy of a shipped level file, so tests can break it in specific ways. */
function rawLevel(file: string): Record<string, any> {
  return JSON.parse(readFileSync(join(process.cwd(), "levels", file), "utf8"));
}

export const rawPolicyCollision = () => rawLevel("02-policy-collision.json");
export const rawConfusedDeputy = () => rawLevel("03-confused-deputy.json");

export function parsed(raw: Record<string, any>): LevelDefinition {
  const r = parseLevel(raw);
  if (!r.ok) throw new Error(`level invalid: ${r.error.join("; ")}`);
  return r.value;
}
