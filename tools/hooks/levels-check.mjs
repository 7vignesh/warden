// Kiro hook (PostFileSave on levels/*.json): validate every level and run the level tests.
// Exit 0 prints one summary line (added to the agent's context). Any failure exits 1 with the
// problems on stderr, so the agent sees what broke.
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSX = join(ROOT, "node_modules", "tsx", "dist", "cli.mjs");
const VITEST = join(ROOT, "node_modules", "vitest", "vitest.mjs");
const LEVEL_TESTS = [
  "tests/levels.props.test.ts",
  "tests/levels.solvable.test.ts",
  "tests/xref.test.ts",
  "tests/onboarding.test.ts",
  "tests/mcp.handlers.test.ts",
];

const run = (args) => spawnSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", timeout: 80_000 });
const tail = (text, n) => text.split(/\r?\n/).filter((l) => l.trim()).slice(-n).join("\n");

const validate = run([TSX, "tools/validate-level.ts"]);
const validateOut = `${validate.stdout ?? ""}${validate.stderr ?? ""}`;
if (validate.status !== 0) {
  process.stderr.write(`levels-check: a level file is invalid.\n${tail(validateOut, 15)}\n`);
  process.exit(1);
}
const summary = /(\d+)\/(\d+) level file\(s\) valid/.exec(validateOut)?.[0] ?? "levels valid";

const tests = run([VITEST, "run", ...LEVEL_TESTS]);
const testOut = `${tests.stdout ?? ""}${tests.stderr ?? ""}`.replace(/\x1b\[[0-9;]*m/g, "");
if (tests.status !== 0) {
  const failed = testOut.split(/\r?\n/).filter((l) => /FAIL|×|AssertionError/.test(l)).slice(0, 12).join("\n");
  process.stderr.write(`levels-check: ${summary}, but level tests failed.\n${failed || tail(testOut, 15)}\n`);
  process.exit(1);
}
const passed = /Tests\s+(\d+) passed/.exec(testOut)?.[1] ?? "?";
process.stdout.write(`levels-check: ${summary}; ${passed} level tests passed.\n`);
