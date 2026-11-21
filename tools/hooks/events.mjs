// Shared helpers for the Kiro hook scripts.
// Hooks are matched broadly (Kiro CLI did not match the "shell" category to its execute_pwsh tool, and
// its file-save trigger did not fire for agent edits), so each script reads the event and decides itself.
import { appendFileSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LOG = join(ROOT, "tmp", "hook-events.log");
const MAX_LOG_BYTES = 200_000;

/** Reads the event JSON from stdin. Returns null when there is no input or it is not JSON. */
export async function readEvent() {
  if (process.stdin.isTTY) return null;
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  if (raw.trim() === "") return null;
  try {
    const event = JSON.parse(raw);
    return event && typeof event === "object" ? event : null;
  } catch {
    return null;
  }
}

/** Appends one line per event to tmp/hook-events.log (gitignored), so real tool names can be checked. */
export function logEvent(hook, event, decision) {
  if (process.env.WARDEN_HOOK_LOG === "0") return;
  try {
    mkdirSync(dirname(LOG), { recursive: true });
    try {
      if (statSync(LOG).size > MAX_LOG_BYTES) writeFileSync(LOG, "");
    } catch {
      // no log yet
    }
    const fields = [
      new Date().toISOString(),
      `hook=${hook}`,
      `event=${event?.hook_event_name ?? "none"}`,
      `tool=${event?.tool_name ?? "none"}`,
      `decision=${decision}`,
    ];
    appendFileSync(LOG, `${fields.join(" ")}\n`);
  } catch {
    // logging must never break a hook
  }
}

/** Every string inside a value, depth first. */
export function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

/**
 * File paths the event refers to: single-line strings in tool_input, plus top-level path fields
 * (file events). Tool output is ignored, so file contents cannot trigger a hook.
 */
export function eventPaths(event) {
  const candidates = strings(event?.tool_input ?? {});
  for (const [key, value] of Object.entries(event ?? {})) {
    if (/path|file/i.test(key)) strings(value, candidates);
  }
  return [...new Set(candidates.filter((s) => s.length < 300 && !/[\r\n]/.test(s) && /[\\/]/.test(s)))];
}
