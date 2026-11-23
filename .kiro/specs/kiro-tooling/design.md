# Design: Kiro tooling

## 1. Overview

```
 Kiro session (started in D:\projects\warden)
 ├─ hooks (.kiro/hooks/*.json) ──► node tools/hooks/*.mjs
 ├─ MCP: warden-levels (from .kiro/settings/mcp.json)
 │     └─ tools/mcp/server.ts ──► tools/mcp/handlers.ts ──► src/levels, src/engine, src/session, src/warden/simulator
 │                                                    └──► tools/playtest/driver.ts ──► vite preview + headless Edge
 └─ custom agent: warden-playtester (.kiro/agents/warden-playtester.json)
       └─ its own warden-levels --only playtest   (no other tools, no AGENTS.md / steering)
```

Pure handler functions are separated from the MCP transport so they can be unit tested without spawning a process.

## 2. Files

```
tools/mcp/server.ts        stdio MCP server; registers tools; --only <tool>
tools/mcp/handlers.ts      listLevels, validateLevel, solveLevel, checkForgery (pure, no I/O except reading levels/)
tools/mcp/schemas.ts       Zod input schemas, shared with tests
tools/playtest/driver.ts   playtest(actions): moved from tmp/play.ts, returns screen text (string)
tools/playtest/cli.ts      npx tsx tools/playtest/cli.ts actions.json (manual use)
tools/hooks/levels-check.mjs
tools/hooks/push-guard.mjs
tools/hooks/session-status.mjs
.kiro/hooks/levels-check.json, push-guard.json, session-status.json, test-on-save.json (narrowed)
.kiro/agents/warden-playtester.json
tests/mcp.handlers.test.ts     fast: handler behavior and input validation
tests/tools/mcp.stdio.test.ts  slow: spawn server, list tools, call validate_level and solve_level
tests/tools/hooks.test.ts      slow: run hook scripts with sample stdin, check exit codes and output
docs/playtests/                one markdown report per playtester run
```

`package.json`: add `@modelcontextprotocol/sdk` (pinned, currently 1.32.2) as a dev dependency; add `test:tools` (vitest config for `tests/tools/**`); `test:fast` excludes `tests/tools/**`.

## 3. MCP tools

All inputs are Zod-validated. Level references are `levelId` matching `^[a-z0-9-]+$` and resolved against the loaded level set, never as raw paths.

| Tool | Input | Output (text content, JSON) |
|---|---|---|
| `list_levels` | none | `[{id, order, title, owasp, files: [{path, editable}], wardens: [id]}]` |
| `validate_level` | `{levelId}` or `{json: string}` (max 64 KB) | `{ok: true, id}` or `{ok: false, problems: [...]}` |
| `solve_level` | `{levelId}` | `{won, messagesUsed, steps: [...short trace lines]}` |
| `check_forgery` | `{levelId, edits: [{path, content}] (max 10, 4000 chars each)}` | `{editErrors: [...], predicate: [{id,label,met}], signing: [{id,label,met}]}` |
| `playtest` | `{level: 1..3, actions: [...] (max 50)}` | screen text after each action, capped at 60 KB |

`playtest` actions match the current play tool: `open`, `write`, `talk`, `say`, `hint`, `look`. It builds `dist/` only if missing, starts `vite preview` on a random free port, routes every non-localhost request to abort, and closes the browser and server in `finally`. Its output is generated only from rendered UI text, so it can only show what a player sees.

Errors: invalid input returns an MCP tool error with Zod messages; internal failures return `isError: true` with a one-line message, never a stack trace.

## 4. Blind playtester

`.kiro/agents/warden-playtester.json`:
```json
{
  "name": "warden-playtester",
  "description": "Plays a Warden level as a first-time player through the screen only, then reports where it got stuck.",
  "tools": ["@warden-play/playtest"],
  "includeMcpJson": false,
  "mcpServers": {
    "warden-play": { "command": "npx", "args": ["--no-install", "tsx", "tools/mcp/server.ts", "--only", "playtest"], "timeout": 120000, "requestTimeout": 180000 }
  },
  "permissions": { "rules": [
    { "capability": "mcp", "match": ["warden-play/playtest"], "effect": "allow" },
    { "capability": "filesystem", "effect": "deny" },
    { "capability": "shell", "effect": "deny" },
    { "capability": "web_fetch", "effect": "deny" },
    { "capability": "web_search", "effect": "deny" },
    { "capability": "subagent", "effect": "deny" }
  ]},
  "resources": [],
  "prompt": "file://./warden-playtester.prompt.md"
}
```
Two layers keep it blind: it is given no read tools (`tools`), and reads are denied even if a tool appeared (`permissions`, deny wins). The third leak, inherited `AGENTS.md`, is closed by the workspace setting (U3). The verification in T2.6 checks all three.

Server name `warden-play` is distinct from the main `warden-levels`, so the playtester never sees `solve_level` or `check_forgery`, which would reveal answers.

## 5. Hooks

| File | Trigger | Matcher | Command | Timeout |
|---|---|---|---|---|
| `on-edit.json` | PostToolUse | none | `node tools/hooks/on-edit.mjs` | 90 s |
| `push-guard.json` | PreToolUse | none | `node tools/hooks/push-guard.mjs` | 10 s |
| `session-status.json` | SessionStart | none | `node tools/hooks/session-status.mjs` | 15 s |
| `log-kiro-usage.json` | PostTaskExec | unchanged | unchanged | - |

**Change after the first live check (2026-11-22).** The original `levels-check` and `test-on-save` hooks used PostFileSave with path matchers, and `push-guard` used the matcher `shell`. In Kiro CLI 3.5.0, SessionStart fired, but PostFileSave did not fire for the agent's edit tools, and `shell` did not match the shell tool `execute_pwsh`, so a push went through unguarded. The tool hooks now have no matcher, and each script reads the event and decides for itself:
- `on-edit.mjs` acts only for write tools (name contains write, replace, edit, create, append, delete, save, patch, or move) and file events. It takes paths from `tool_input` and path fields only, ignoring multi-line strings, so file contents cannot trigger it. A level file runs `levels-check.mjs`; a file in `src/` or `tests/` runs the fast suite. If both triggers fire for one edit, the second is skipped for 15 s.
- `push-guard.mjs` acts only for shell tools (name contains pwsh, bash, shell, cmd, command, or exec), so a file write that contains the text of a push is never blocked.
- Both log one line per event to `tmp/hook-events.log` (gitignored), to confirm real tool names; matchers can be added once those are known.

**Second change (2026-11-22, after the retest).** The log showed PostFileSave and PostToolUse both firing for one edit at the same moment, and no result reached the agent. `on-edit` now uses PostToolUse only (its output is documented to reach the agent; file-save output is not), the 15 s dedupe is gone, and every check logs its result as `decision=levels:pass`, `levels:fail`, `code:pass`, or `code:fail`, so a clean run can be told apart from lost output.

Original table, kept for reference:

| File | Trigger | Matcher | Command | Timeout |
|---|---|---|---|---|
| `levels-check.json` | PostFileSave | `(^|[\\/])levels[\\/][^\\/]+\.json$` | `node tools/hooks/levels-check.mjs` | 90 s |
| `test-on-save.json` (narrowed) | PostFileSave | `(^|[\\/])(src|tests)[\\/].*\.(ts|tsx|css)$` | `npm run test:fast --silent` | 90 s |
| `push-guard.json` | PreToolUse | `shell` | `node tools/hooks/push-guard.mjs` | 10 s |
| `session-status.json` | SessionStart | none | `node tools/hooks/session-status.mjs` | 15 s |
| `log-kiro-usage.json` | PostTaskExec | unchanged | unchanged | - |

- `levels-check.mjs`: runs `validate-level` then `vitest run tests/levels.* tests/xref.test.ts tests/onboarding.test.ts`; prints one summary line on success; on failure prints the failing level problems or test names to stderr and exits 1.
- `push-guard.mjs`: reads stdin JSON, extracts the shell command, splits on `;`, `&&`, `||`, `|`. If any part is `git push` with `--force`, `-f`, or `--force-with-lease`: exit 2 with a reason. If any part is `git push`: print `{"hookSpecificOutput":{"permissionDecision":"ask","permissionDecisionReason":"Pushing to GitHub. Confirm."}}`. Otherwise exit 0 silently. Unparseable stdin: exit 0 (never block normal work by accident).
- `session-status.mjs`: runs git commands with a short timeout; prints at most 6 lines. Any git error prints "status unavailable" and exits 0.

The exact stdin field holding the shell command is confirmed during implementation by logging one real event (task K3.2), because the docs show the event shape only for some triggers.

## 6. Testing
- Fast (`test:fast`, on save): handler tests in `tests/mcp.handlers.test.ts`, including path traversal rejection, oversized input, and that `check_forgery` matches the engine for the known near-miss cases.
- Slow (`test:tools`, manual and before commits): stdio round trip with the SDK client; hook scripts run with sample stdin (push guard: plain push asks, force push blocks, other commands pass; levels check passes on clean levels and fails on a broken copy).
- Live verification in a project session (manual, recorded): each hook fires once; the playtester cannot read files or quote `AGENTS.md`; the main session can call all five MCP tools.

## 7. Risks
- **Hook stdin shape differs from docs.** Mitigation: log a real event first (K3.2).
- **`disableInheritingDefaultResources` does not affect agents launched as sub-agents.** Mitigation: run the playtester as a top-level agent (`--agent`), and the blindness check in T2.6 decides whether results are trusted.
- **MCP tool calls in an untrusted workspace always ask.** Mitigation: U1 trusts the workspace.
- **Playtest is slow (browser per call, about 5 to 10 s).** Acceptable; one call plays a whole action list.
- **Windows `npx` in MCP config.** If `npx` fails to start under Kiro on Windows, use `node` with the tsx loader (`node --import tsx tools/mcp/server.ts`).
