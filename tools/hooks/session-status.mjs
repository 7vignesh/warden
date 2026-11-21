// Kiro hook (SessionStart): give a new session a short project status.
// Prints at most 6 lines to stdout (added to the agent's context). Never fails the session.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SPECS = ["warden", "kiro-tooling"];

function git(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8", timeout: 5000 });
  return r.status === 0 ? r.stdout.trim() : undefined;
}

function firstOpenTask(spec) {
  try {
    const text = readFileSync(join(ROOT, ".kiro", "specs", spec, "tasks.md"), "utf8");
    const line = text.split(/\r?\n/).find((l) => /^- \[ \] /.test(l));
    return line ? line.replace(/^- \[ \] /, "").replace(/\s+_[^_]*_\s*$/, "").slice(0, 140) : "all tasks done";
  } catch {
    return "tasks file not found";
  }
}

const lines = ["Warden project status (session-status hook):"];
const branch = git(["branch", "--show-current"]);
if (branch === undefined) lines.push("git: status unavailable");
else {
  const ahead = git(["rev-list", "--count", "@{u}..HEAD"]);
  const dirty = (git(["status", "--porcelain"]) ?? "").split(/\r?\n/).filter(Boolean).length;
  lines.push(`git: branch ${branch}, ${ahead ?? "?"} unpushed commit(s), ${dirty} uncommitted file(s)`);
}
for (const spec of SPECS) lines.push(`next task (${spec}): ${firstOpenTask(spec)}`);
process.stdout.write(`${lines.slice(0, 6).join("\n")}\n`);
