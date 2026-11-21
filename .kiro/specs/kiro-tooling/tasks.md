# Tasks: Kiro tooling

Order: MCP server first (the playtester depends on it), then hooks, then the playtester. Each task ends with a check. Steps marked **(you)** need the user.

## K0. Session setup
- [ ] K0.1 **(you)** Restart Kiro in `D:\projects\warden` and trust the workspace. _U1_
- [ ] K0.2 Confirm the project config loads: the current `test-on-save` hook fires on a trivial test-file save. Record the result (this also explains why it never fired before). _T3.7_

## K1. Level tools (MCP)
- [ ] K1.1 Add `@modelcontextprotocol/sdk` (exact pin) and `test:tools`; exclude `tests/tools/**` from `test:fast`. _T4.2_
- [ ] K1.2 `tools/mcp/schemas.ts` and `handlers.ts`: `listLevels`, `validateLevel`, `solveLevel`, `checkForgery`, reusing game modules. _T1.2-T1.5_
- [ ] K1.3 Move `tmp/play.ts` to `tools/playtest/driver.ts` (returns text; network locked to localhost; caps; timeout) and add `tools/playtest/cli.ts`. _T1.6, T1.7_
- [ ] K1.4 `tools/mcp/server.ts` with stdio transport and `--only`. _T1.1, T1.9_
- [ ] K1.5 Tests: `tests/mcp.handlers.test.ts` (fast) and `tests/tools/mcp.stdio.test.ts` (slow). Include bug injection on one handler. _T1, T4.2_
- [ ] K1.6 **(you)** Add the server to `.kiro/settings/mcp.json` (JSON provided). _U2_
- [ ] K1.7 Live check: call all five tools from the project session; record outputs. _T1_

## K2. Hooks
- [ ] K2.1 `tools/hooks/levels-check.mjs` + `.kiro/hooks/levels-check.json`; narrow `test-on-save.json` to `src/` and `tests/`. _T3.2, T3.3_
- [ ] K2.2 Log one real PreToolUse event to confirm the stdin shape, then write `tools/hooks/push-guard.mjs` + hook. _T3.4_
- [ ] K2.3 `tools/hooks/session-status.mjs` + hook. _T3.5_
- [ ] K2.4 `tests/tools/hooks.test.ts`: run each script with sample stdin. _T3_
- [ ] K2.5 Live check: trigger each hook once on purpose (break a level file then fix it, ask to push, start a new session); record in `docs/KIRO_USAGE.md`. _T3.7_

## K3. Blind playtester
- [ ] K3.1 `.kiro/agents/warden-playtester.json` and `warden-playtester.prompt.md`. _T2.1-T2.4_
- [ ] K3.2 **(you)** Run `kiro-cli settings --workspace chat.disableInheritingDefaultResources true`. _U3_
- [ ] K3.3 Blindness check: in a playtester session, ask it to read `levels/02-policy-collision.json` and to quote `AGENTS.md`; both must fail. Record. _T2.6_
- [ ] K3.4 Run the playtester on Levels 2 and 3; save reports in `docs/playtests/`; compare with the earlier contaminated results. _T2.5_

## K4. Wrap-up
- [ ] K4.1 README and `docs/KIRO_USAGE.md` sections for the three features with measured results. _T4.3_
- [ ] K4.2 Fresh-clone check: `npm ci`, typecheck, `test:fast`, `test:tools`, `e2e`. Commit in logical pieces. _T4_
