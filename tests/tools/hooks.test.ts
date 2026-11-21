import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Runs each hook script the way Kiro does: in the project root, with the event JSON on stdin.
const ROOT = process.cwd();
const run = (script: string, stdin = "") =>
  spawnSync(process.execPath, [join(ROOT, "tools", "hooks", script)], { cwd: ROOT, input: stdin, encoding: "utf8", timeout: 120_000 });

const preToolUse = (command: string) =>
  JSON.stringify({ hook_event_name: "PreToolUse", cwd: ROOT, session_id: "t", tool_name: "execute_pwsh", tool_input: { command } });

describe("push-guard", () => {
  const cases: Array<[string, "ask" | "block" | "pass"]> = [
    ["git push origin main", "ask"],
    ["cd D:\\projects\\warden; git push origin main 2>&1 | Select-String x", "ask"],
    ["git -C . push", "ask"],
    ["git push --follow-tags", "ask"],
    ["git push --force", "block"],
    ["git push -f origin main", "block"],
    ["git push -uf origin main", "block"],
    ["git push --force-with-lease", "block"],
    ["git push origin +main", "block"],
    // Splitting matters: a force flag on a different command must not be blamed on the push.
    ["git push origin main; git branch -f old HEAD", "ask"],
    ["git push && git reset --force-with-lease-ish", "ask"],
    ["git status; git log --oneline -3", "pass"],
    ["npm run test:fast", "pass"],
    ["git pull --rebase", "pass"],
  ];
  for (const [command, expected] of cases) {
    it(`${expected}: ${command}`, () => {
      const r = run("push-guard.mjs", preToolUse(command));
      if (expected === "block") {
        expect(r.status).toBe(2);
        expect(r.stderr).toContain("force pushes are blocked");
      } else if (expected === "ask") {
        expect(r.status).toBe(0);
        expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("ask");
      } else {
        expect(r.status).toBe(0);
        expect(r.stdout).toBe("");
      }
    });
  }

  it("lets unreadable input through instead of blocking work", () => {
    for (const stdin of ["", "not json", "{}", '{"tool_input": 42}']) {
      const r = run("push-guard.mjs", stdin);
      expect(r.status, stdin).toBe(0);
      expect(r.stdout, stdin).toBe("");
    }
  });
});

describe("levels-check", () => {
  it("passes on the shipped levels with a one-line summary", () => {
    const r = run("levels-check.mjs", "{}");
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^levels-check: 3\/3 level file\(s\) valid; \d+ level tests passed\.\n$/);
  });

  it("fails with the problem on stderr when a level file breaks", () => {
    const file = join(ROOT, "levels", "01-poisoned-telemetry.json");
    const original = readFileSync(file, "utf8");
    try {
      const broken = JSON.parse(original);
      broken.files["/var/log/health.log"].editable = false;
      writeFileSync(file, JSON.stringify(broken, null, 2), "utf8");
      const r = run("levels-check.mjs", "{}");
      expect(r.status).toBe(1);
      expect(r.stdout).toBe("");
      expect(r.stderr).toContain("levels-check: a level file is invalid.");
      // The validator must stop the hook before the slower test run starts.
      expect(r.stderr).not.toContain("level tests failed");
      expect(r.stderr).toContain("01-poisoned-telemetry");
    } finally {
      writeFileSync(file, original, "utf8");
    }
    expect(readFileSync(file, "utf8")).toBe(original);
  });
});

describe("session-status", () => {
  it("prints a short status with branch and next tasks", () => {
    const r = run("session-status.mjs", "{}");
    expect(r.status).toBe(0);
    const lines = r.stdout.trim().split(/\r?\n/);
    expect(lines.length).toBeLessThanOrEqual(6);
    expect(lines[1]).toMatch(/^git: branch main, \d+ unpushed commit\(s\), \d+ uncommitted file\(s\)$/);
    expect(r.stdout).toContain("next task (warden):");
    expect(r.stdout).toContain("next task (kiro-tooling):");
  });
});

describe("hook files", () => {
  it("are valid v1 hook definitions that call scripts which exist", () => {
    for (const name of ["levels-check", "test-on-save", "push-guard", "session-status", "log-kiro-usage"]) {
      const def = JSON.parse(readFileSync(join(ROOT, ".kiro", "hooks", `${name}.json`), "utf8"));
      expect(def.version, name).toBe("v1");
      for (const h of def.hooks) {
        expect(typeof h.name, name).toBe("string");
        expect(typeof h.trigger, name).toBe("string");
        if (h.matcher && h.trigger === "PostFileSave") expect(() => new RegExp(h.matcher), name).not.toThrow();
        const script = /node (tools\/hooks\/\S+\.mjs)/.exec(h.action.command ?? "")?.[1];
        if (script) expect(() => readFileSync(join(ROOT, script)), script).not.toThrow();
      }
    }
  });

  it("file matchers route saves to the right hook", () => {
    const re = (name: string) => new RegExp(JSON.parse(readFileSync(join(ROOT, ".kiro", "hooks", `${name}.json`), "utf8")).hooks[0].matcher);
    const levels = re("levels-check");
    const tests = re("test-on-save");
    for (const p of ["levels/01-poisoned-telemetry.json", "D:\\projects\\warden\\levels\\02-policy-collision.json", "levels/03-x.json"]) {
      expect(levels.test(p), p).toBe(true);
      expect(tests.test(p), p).toBe(false);
    }
    // A level file must not also trigger the fast tests (levels-check covers it).
    expect(tests.test("D:\\projects\\warden\\levels\\a.ts")).toBe(false);
    for (const p of ["src/engine/predicate.ts", "D:\\projects\\warden\\src\\ui\\game.css", "tests/xref.test.ts"]) {
      expect(tests.test(p), p).toBe(true);
      expect(levels.test(p), p).toBe(false);
    }
    for (const p of ["README.md", "docs/benchmarks/x.json", "package.json"]) {
      expect(tests.test(p) || levels.test(p), p).toBe(false);
    }
  });
});
