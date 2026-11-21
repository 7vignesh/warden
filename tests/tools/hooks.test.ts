import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Runs each hook script the way Kiro does: in the project root, with the event JSON on stdin.
const ROOT = process.cwd();
const ENV = { ...process.env, WARDEN_HOOK_LOG: "0", WARDEN_HOOK_NO_DEDUPE: "1" };
const run = (script: string, stdin = "", env: NodeJS.ProcessEnv = ENV) =>
  spawnSync(process.execPath, [join(ROOT, "tools", "hooks", script)], { cwd: ROOT, input: stdin, encoding: "utf8", timeout: 120_000, env });

const toolEvent = (hook: string, tool: string, input: Record<string, unknown>) =>
  JSON.stringify({ hook_event_name: hook, cwd: ROOT, session_id: "t", tool_name: tool, tool_input: input });
const shell = (command: string) => toolEvent("PreToolUse", "execute_pwsh", { command });

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
      const r = run("push-guard.mjs", shell(command));
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

  it("guards pushes from any shell tool name", () => {
    for (const tool of ["execute_pwsh", "execute_bash", "shell", "run_command", "Bash"]) {
      expect(JSON.parse(run("push-guard.mjs", toolEvent("PreToolUse", tool, { command: "git push" })).stdout).hookSpecificOutput.permissionDecision, tool).toBe("ask");
    }
  });

  it("never blocks a file write that only contains the text of a force push", () => {
    for (const tool of ["fs_write", "str_replace", "read_file"]) {
      const r = run("push-guard.mjs", toolEvent("PreToolUse", tool, { path: "docs/x.md", text: "never run git push --force" }));
      expect(r.status, tool).toBe(0);
      expect(r.stdout, tool).toBe("");
    }
  });

  it("lets unreadable input through instead of blocking work", () => {
    for (const stdin of ["", "not json", "{}", '{"tool_input": 42}']) {
      const r = run("push-guard.mjs", stdin);
      expect(r.status, stdin).toBe(0);
      expect(r.stdout, stdin).toBe("");
    }
  });
});

describe("levels-check (run by hand or by on-edit)", () => {
  it("passes on the shipped levels with a one-line summary", () => {
    const r = run("levels-check.mjs");
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
      const r = run("levels-check.mjs");
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

describe("on-edit", () => {
  const level = "D:\\projects\\warden\\levels\\01-poisoned-telemetry.json";

  it("runs the level check after a write tool edits a level file", () => {
    for (const [tool, input] of [
      ["fs_write", { path: level, text: "..." }],
      ["str_replace", { path: "levels/02-policy-collision.json", oldStr: "a", newStr: "b" }],
    ] as const) {
      const r = run("on-edit.mjs", toolEvent("PostToolUse", tool, input));
      expect(r.status, `${tool} ${r.stderr}`).toBe(0);
      expect(r.stdout, tool).toMatch(/^levels-check: 3\/3 level file\(s\) valid/);
    }
  });

  it("runs the level check on a file-save event", () => {
    const r = run("on-edit.mjs", JSON.stringify({ hook_event_name: "PostFileSave", cwd: ROOT, path: level }));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^levels-check:/);
  });

  it("runs the fast tests after an edit to src/ or tests/", () => {
    const r = run("on-edit.mjs", toolEvent("PostToolUse", "str_replace", { path: "tests/smoke.test.ts", oldStr: "x", newStr: "y" }));
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^on-edit: \d+ fast tests passed\.\n$/);
  });

  it("stays silent for reads, shell commands, and unrelated files", () => {
    const silent = [
      toolEvent("PostToolUse", "read_file", { path: level }),
      toolEvent("PostToolUse", "execute_pwsh", { command: `notepad ${level}` }),
      toolEvent("PostToolUse", "fs_write", { path: "README.md", text: "Notes\nsee D:/projects/warden/levels/01-poisoned-telemetry.json" }),
      toolEvent("PostToolUse", "fs_write", { path: "docs/x.md", text: "Changed:\ntests/xref.test.ts" }),
      toolEvent("PostToolUse", "fs_write", { path: "docs/benchmarks/x.json", text: "" }),
      "",
      "not json",
    ];
    for (const stdin of silent) {
      const r = run("on-edit.mjs", stdin);
      expect(r.status, stdin).toBe(0);
      expect(r.stdout, stdin).toBe("");
    }
  });

  it("reports a broken level file as a failure", () => {
    const file = join(ROOT, "levels", "01-poisoned-telemetry.json");
    const original = readFileSync(file, "utf8");
    try {
      const broken = JSON.parse(original);
      broken.files["/var/log/health.log"].editable = false;
      writeFileSync(file, JSON.stringify(broken, null, 2), "utf8");
      const r = run("on-edit.mjs", toolEvent("PostToolUse", "fs_write", { path: level, text: "..." }));
      expect(r.status).toBe(1);
      expect(r.stderr).toContain("levels-check: a level file is invalid.");
    } finally {
      writeFileSync(file, original, "utf8");
    }
  });

  it("checks one edit only once when both triggers fire", () => {
    const env = { ...process.env, WARDEN_HOOK_LOG: "0" };
    const edit = toolEvent("PostToolUse", "fs_write", { path: "levels/03-confused-deputy.json", text: "..." });
    const first = run("on-edit.mjs", edit, env);
    const second = run("on-edit.mjs", edit, env);
    expect(first.stdout).toMatch(/^levels-check:/);
    expect(second.stdout).toBe("on-edit: same edit already checked a moment ago.\n");
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
  const names = ["on-edit", "push-guard", "session-status", "log-kiro-usage"];

  it("are valid v1 hook definitions that call scripts which exist", () => {
    for (const name of names) {
      const def = JSON.parse(readFileSync(join(ROOT, ".kiro", "hooks", `${name}.json`), "utf8"));
      expect(def.version, name).toBe("v1");
      for (const h of def.hooks) {
        expect(typeof h.name, name).toBe("string");
        expect(typeof h.trigger, name).toBe("string");
        const script = /node (tools\/hooks\/\S+\.mjs)/.exec(h.action.command ?? "")?.[1];
        if (script) expect(() => readFileSync(join(ROOT, script)), script).not.toThrow();
      }
    }
  });

  it("tool hooks have no matcher, so they cannot miss a tool whose name differs from the docs", () => {
    for (const name of ["on-edit", "push-guard"]) {
      const def = JSON.parse(readFileSync(join(ROOT, ".kiro", "hooks", `${name}.json`), "utf8"));
      for (const h of def.hooks) expect(h.matcher, `${name}: ${h.name}`).toBeUndefined();
    }
  });
});
