// Kiro hook (PostToolUse, every tool): check what an edit affects.
// - Only write tools (name contains write, replace, edit, create, append, delete, save, patch, or move)
//   are considered. Reads and shell commands pass silently.
// - An edit to levels/*.json runs the level check (all levels plus level tests).
// - An edit to src/ or tests/ (.ts, .tsx, .css) runs the fast test suite.
// Exit 0 prints a one-line summary; a failure exits 1 with details on stderr.
// Every check also logs its result (pass or fail) to tmp/hook-events.log, so a clean run can be told
// apart from output that never reached the agent.
// Only PostToolUse is used: in Kiro CLI, PostFileSave also fired for the same edit, and the duplicate run
// raced the first one. Tool hook output is documented to reach the agent; file-save output is not.
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { eventPaths, logEvent, readEvent, ROOT } from "./events.mjs";

const WRITE_TOOL = /write|replace|edit|create|append|delete|save|patch|move/i;
const LEVEL_FILE = /(^|[\\/])levels[\\/][^\\/]+\.json$/;
const CODE_FILE = /(^|[\\/])(src|tests)[\\/].*\.(ts|tsx|css)$/;
const VITEST = join(ROOT, "node_modules", "vitest", "vitest.mjs");

/** @returns {"levels" | "code" | "skip"} */
export function route(event) {
  const tool = event?.tool_name;
  if (!(typeof tool === "string" && WRITE_TOOL.test(tool))) return "skip";
  const paths = eventPaths(event);
  if (paths.some((p) => LEVEL_FILE.test(p))) return "levels";
  if (paths.some((p) => CODE_FILE.test(p))) return "code";
  return "skip";
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
  const code = decision === "levels" ? runLevels() : runFastTests();
  logEvent("on-edit", event, `${decision}:${code === 0 ? "pass" : "fail"}`);
  process.exit(code);
}

const isMain = process.argv[1] && /on-edit\.mjs$/.test(process.argv[1]);
if (isMain) await main();
