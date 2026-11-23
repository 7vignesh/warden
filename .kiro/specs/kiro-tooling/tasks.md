# Tasks: Kiro tooling

Order: MCP server first (the playtester depends on it), then hooks, then the playtester. Each task ends with a check. Steps marked **(you)** need the user.

## K0. Session setup
- [x] K0.1 **(you)** Restart Kiro in `D:\projects\warden` and trust the workspace. _U1_
- [x] K0.2 Confirm the project config loads: a hook fires in a session started in `D:\projects\warden`. Record the result. Done 2026-11-22: session-status fired. (In the earlier session, started from `D:\projects`, an edit to a test file did not fire `test-on-save`.) _T3.7_

## K1. Level tools (MCP)
- [x] K1.1 Add `@modelcontextprotocol/sdk` (exact pin) and `test:tools`; exclude `tests/tools/**` from `test:fast`. _T4.2_
- [x] K1.2 `tools/mcp/schemas.ts` and `handlers.ts`: `listLevels`, `validateLevel`, `solveLevel`, `checkForgery`, reusing game modules. _T1.2-T1.5_
- [x] K1.3 Move `tmp/play.ts` to `tools/playtest/driver.ts` (returns text; network locked to localhost; caps; timeout) and add `tools/playtest/cli.ts`. _T1.6, T1.7_
- [x] K1.4 `tools/mcp/server.ts` with stdio transport and `--only`. _T1.1, T1.9_
- [x] K1.5 Tests: `tests/mcp.handlers.test.ts` (fast) and `tests/tools/mcp.stdio.test.ts` (slow). 6 of 6 injected handler bugs caught. _T1, T4.2_
- [x] K1.6 **(you)** Add the server to `.kiro/settings/mcp.json`. _U2_
- [x] K1.7 Live check: call all five tools from the project session; record outputs. Done 2026-11-22, all five worked. _T1_

## K2. Hooks
- [x] K2.1 `tools/hooks/levels-check.mjs` + `.kiro/hooks/levels-check.json`; narrow `test-on-save.json` to `src/` and `tests/`. _T3.2, T3.3_
- [x] K2.2 `tools/hooks/push-guard.mjs` + hook. Written from the documented PreToolUse shape (`tool_input`); it scans every string in `tool_input`, so it works whatever the field name. Confirm live in K2.5. _T3.4_
- [x] K2.3 `tools/hooks/session-status.mjs` + hook. _T3.5_
- [x] K2.4 `tests/tools/hooks.test.ts`: run each script with sample stdin. 5 of 5 injected hook bugs caught. _T3_
- [x] K2.5 Live check, done 2026-11-23. session-status fired and its output reached the agent. push-guard confirmed (the user got the allow/deny prompt before `git push`). on-edit runs on every write and records the right result: after making `/var/log/health.log` read-only in Level 1 the log showed `levels:fail` (the level became unsolvable), and after restoring it `levels:pass`. **Known limitation:** in Kiro CLI 3.5.0 the output of PostToolUse hooks does not reach the agent, although the docs say it should; SessionStart output does. Results are read from `tmp/hook-events.log`. _T3.7_

## K3. Blind playtester
- [x] K3.1 `.kiro/agents/warden-playtester.md` (Markdown agent: config in front matter, prompt in the body). _T2.1-T2.4_
- [x] K3.2 **(you)** Run `kiro-cli settings --workspace chat.disableInheritingDefaultResources true`. Confirmed `true (workspace)`. _U3_
- [x] K3.3 Blindness check: the playtester did not show `levels/02-policy-collision.json` or `AGENTS.md` (reported by the user, 2026-11-22; exact reply not saved). See `docs/playtests/README.md`. _T2.6_
- [x] K3.4 Blind playtests of Levels 2 and 3 saved in `docs/playtests/`; both solved with no hints (1.5 and 1-2 of 5), matching the earlier contaminated runs. _T2.5_

## K4. Wrap-up
- [ ] K4.1 README and `docs/KIRO_USAGE.md` sections for the three features with measured results. _T4.3_
- [ ] K4.2 Fresh-clone check: `npm ci`, typecheck, `test:fast`, `test:tools`, `e2e`. Commit in logical pieces. _T4_
