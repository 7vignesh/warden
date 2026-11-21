# Requirements: Kiro tooling (blind playtester, working hooks, level-authoring MCP server)

Make Kiro part of how Warden is built and tested, not only the tool that wrote the code. Three features:

1. **Level tools over MCP** (built first, because the other two use it).
2. **A blind playtester agent** that plays a level through the screen only and cannot read the answers.
3. **Hooks that visibly fire** and guard the workflow.

Background facts this spec relies on (checked against kiro.dev docs on 2026-11-19, Kiro CLI 3.5.0):
- Kiro loads `.kiro/hooks`, `.kiro/agents`, steering, and `.kiro/settings/mcp.json` from the folder Kiro is started in. Sessions so far were started in `D:\projects`, so `warden/.kiro/hooks` most likely never loaded.
- Kiro always refuses agent writes to `.kiro/settings/`, and always asks before agent writes to `.kiro/agents/` and `.kiro/hooks/`.
- Custom agents inherit steering, skills, and `AGENTS.md` unless `chat.disableInheritingDefaultResources` is set to true. Built-in agents always inherit them.
- Hook command actions receive event JSON on stdin. Exit 0 adds stdout to the agent's context; any other exit code sends stderr to the agent as an error. For PreToolUse, exit 2 blocks the tool call, and stdout JSON can ask the user.

## Glossary
- **Level tools**: the functions exposed by the Warden MCP server.
- **Playtester**: the custom agent `warden-playtester`.
- **Screen text**: what a player sees in the browser: mission card, file names, file contents once opened, conversation, vault locks, example messages, message counter. Never level JSON, tests, specs, or source.
- **Project session**: a Kiro session started in `D:\projects\warden`.

## T1. Level tools (MCP server)
1. THE System SHALL provide a local stdio MCP server, `warden-levels`, started with `npx tsx tools/mcp/server.ts`.
2. THE server SHALL expose these tools:
   - `list_levels`: id, order, title, OWASP tag, file paths with editable flags, warden ids.
   - `validate_level`: validate one level file from `levels/`, or level JSON passed in the call, using the real loader. Returns `ok` or the problem list.
   - `solve_level`: play the level's reference solution through the simulator and the real session code. Returns won or not, messages used, and a short trace.
   - `check_forgery`: apply given file edits to a level's initial state and report each win condition (and signing condition) as met or not. Changes nothing on disk.
   - `playtest`: play the real production build in headless Edge from a list of player actions and return screen text only.
3. THE tools SHALL reuse the game's own modules (`src/levels`, `src/engine`, `src/session`, `src/warden/simulator`). THE tools SHALL NOT re-implement game rules.
4. WHEN a tool receives a level id or file name, THE server SHALL accept only levels that exist under `levels/`. IF a name contains a path separator or `..`, THEN THE server SHALL reject it.
5. THE server SHALL validate every tool input with Zod and return a readable error, not a crash, for invalid input.
6. THE `playtest` tool SHALL block all network requests except to its own local preview server, SHALL cap actions per call (50) and text sizes, and SHALL return within a time limit (120 s).
7. THE `playtest` tool SHALL NOT return level JSON, predicate details, hints that were not revealed, or the reference solution.
8. THE server SHALL NOT write to any file, except `playtest` building `dist/` when it is missing.
9. IF the server is started with `--only <tool>`, THEN THE server SHALL register only that tool.

## T2. Blind playtester agent
1. THE System SHALL provide a custom agent at `.kiro/agents/warden-playtester.json`.
2. THE Playtester SHALL have exactly one tool: `playtest` from its own `warden-levels` server started with `--only playtest`. It SHALL have no file read, file write, shell, web, or sub-agent tools, and SHALL NOT include workspace MCP servers (`includeMcpJson: false`).
3. THE Playtester SHALL NOT receive `AGENTS.md`, steering, or skills. This requires the workspace setting `chat.disableInheritingDefaultResources` = true (a user step).
4. THE Playtester's prompt SHALL tell it to play as a first-time player, use hints only when stuck, and end with a fixed report: solved, tool calls, messages used, hints used and when, where it got stuck, anything unfair, difficulty 1 to 5, suggestions.
5. THE project SHALL document how to run it (`kiro-cli chat --agent warden-playtester` from the project folder, or the agent picker) and record each run's report in `docs/playtests/`.
6. Verification (blindness): IN a playtester session, WHEN asked to read `levels/02-policy-collision.json` or to quote `AGENTS.md`, THE Playtester SHALL be unable to. This SHALL be checked and recorded before its reports are trusted.

## T3. Hooks
1. ALL hooks SHALL be standalone files in `.kiro/hooks/`, run Node scripts in `tools/hooks/` (portable across Windows, macOS, Linux), and finish within their timeout.
2. Level check: WHEN a file under `levels/` is saved, THE hook SHALL validate all levels and run the level tests (`tests/levels.*`, `tests/xref.test.ts`, `tests/onboarding.test.ts`). IF anything fails, THEN THE hook SHALL exit non-zero with a short summary so the agent sees the error.
3. Fast tests: WHEN a file under `src/` or `tests/` is saved, THE hook SHALL run `npm run test:fast`. (Replaces the current matcher, which also overlaps levels.)
4. Push guard: BEFORE a shell tool call whose command contains `git push`, THE hook SHALL ask the user to confirm. IF the command contains `--force` or `-f` as a push flag, THEN THE hook SHALL block it.
5. Session context: WHEN a project session starts, THE hook SHALL add a short status to the agent's context: branch, unpushed commit count, uncommitted file count, and the first unchecked task in `.kiro/specs/warden/tasks.md`.
6. THE existing `log-kiro-usage` hook SHALL stay.
7. Verification (firing): IN a project session, each hook SHALL be triggered once on purpose and its visible effect recorded in `docs/KIRO_USAGE.md`. A hook counts as working only after this.

## T4. Delivery
1. THE work SHALL not change game behavior, the level files' win conditions, or the shipped bundle.
2. `npm run test:fast` SHALL stay under 30 seconds. Tests that spawn processes or browsers SHALL live in a separate script (`npm run test:tools`).
3. README and `docs/KIRO_USAGE.md` SHALL describe each feature, how to run it, and its measured result.

## User steps (the agent cannot do these)
- U1. Start Kiro in `D:\projects\warden` and trust the workspace.
- U2. Add the `warden-levels` server to `.kiro/settings/mcp.json` (exact JSON provided).
- U3. Run `kiro-cli settings --workspace chat.disableInheritingDefaultResources true`.
- U4. Approve the agent's writes to `.kiro/agents/` and `.kiro/hooks/` when prompted.

## Non-goals
- A Kiro Power or Skill package (possible follow-up once the MCP server works).
- Kiro Crew scheduling.
- Running the playtester in CI.
