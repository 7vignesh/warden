// Kiro hook (PostToolUse and PostFileSave, every tool): check what an edit affects.
// - Only write tools (name contains write, replace, edit, create, append, delete, save, patch, or move)
//   and file events are considered. Reads and shell commands pass silently.
// - An edit to levels/*.json runs the level check (all levels plus level tests).
// - An edit to src/ or tests/ (.ts, .tsx, .css) runs the fast test suite.
// - The same paths within a few seconds are checked once, in case both triggers fire for one edit.
// Exit 0 prints a one-line summary; a failure exits 1 with details on stderr.
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { eventPaths, logEvent, readEvent, ROOT } from "./events.mjs";

const WRITE_TOOL = /write|replace|edit|create|append|delete|save|patch|move/i;
const LEVEL_FILE = /(^|[\\/])levels[\\/][^\\/]+\.json$/;
const CODE_FILE = /(^|[\\/])(src|tests)[\\/].*\.(ts|tsx|css)$/;
const DEDUPE_MS = 15_000;
const MARKER = join(ROOT, "tmp", "hook-last-edit.json");
const VITEST = join(ROOT, "node_modules", "vitest", "vitest.mjs");

/** @returns {"levels" | "code" | "skip"} */
export function route(event) {
  const isFileEvent = /file/i.test(String(event?.hook_event_name ?? ""));
  const tool = event?.tool_name;
  if (!isFileEvent && !(typeof tool === "string" && WRITE_TOOL.test(tool))) return "skip";
  const paths = eventPaths(event);
  if (paths.some((p) => LEVEL_FILE.test(p))) return "levels";
  if (paths.some((p) => CODE_FILE.test(p))) return "code";
  return "skip";
}

function recentlyChecked(key) {
  if (process.env.WARDEN_HOOK_NO_DEDUPE === "1") return false;
  try {
    const last = JSON.parse(readFileSync(MARKER, "utf8"));
    if (last.key === key && Date.now() - last.time < DEDUPE_MS) return true;
  } catch {
    // no marker yet
  }
  try {
    mkdirSync(join(ROOT, "tmp"), { recursive: true });
    writeFileSync(MARKER, JSON.stringify({ key, time: Date.now() }));
  } catch {
    // dedupe is best effort
  }
  return false;
}

function runLevels() {
  const r = spawnSync(process.execPath, [join(ROOT, "tools", "hooks", "levels-check.mjs")], { cwd: ROOT, encoding: "utf8", input: "", timeout: 85_000 });
  process.stdout.write(r.stdout ?? "");
  process.stderr.write(r.stderr ?? "");
  return r.status ?? 1;
}

function runFastTests() {
  const r = spawnSync(process.execPath, [VITEST, "run"], { cwd: ROOT, encoding: "utf8", timeout: 85_000 });
  const out = `${r.stdout ?? ""}${r.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
  if (r.status !== 0) {
    const failed = out.split(/\r?\n/).filter((l) => /FAIL|×|AssertionError/.test(l)).slice(0, 12).join("\n");
    process.stderr.write(`on-edit: fast tests failed.\n${failed || out.split(/\r?\n/).slice(-15).join("\n")}\n`);
    return 1;
  }
  process.stdout.write(`on-edit: ${/Tests\s+(\d+) passed/.exec(out)?.[1] ?? "?"} fast tests passed.\n`);
  return 0;
}

async function main() {
  const event = await readEvent();
  if (!event) return;
  const decision = route(event);
  logEvent("on-edit", event, decision);
  if (decision === "skip") return;
  if (recentlyChecked(`${decision}:${eventPaths(event).sort().join("|")}`)) {
    process.stdout.write("on-edit: same edit already checked a moment ago.\n");
    return;
  }
  process.exit(decision === "levels" ? runLevels() : runFastTests());
}

const isMain = process.argv[1] && /on-edit\.mjs$/.test(process.argv[1]);
if (isMain) await main();
