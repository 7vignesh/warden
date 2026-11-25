# How Kiro Was Used

This is the write-up of how Warden was built with Kiro. The [Log](#log) below is the running record it is drawn from. Every number here was measured in this repo; the source is named next to it.

## Kiro products used
- [x] Kiro CLI (3.5.0, on Windows with PowerShell): the whole build, from spec to deploy.
- [ ] Kiro IDE
- [ ] Kiro Web
- [ ] Kiro Crew

## In one paragraph
Warden was built spec-first. Two specs in `.kiro/specs/` define what to build. Three steering files keep every session on the same rules. Four hooks guard the workflow. A project MCP server (`warden-levels`) lets Kiro validate, solve and play levels. A custom agent (`warden-playtester`) plays the game blind and reports where it got stuck. Property-based tests (P1 to P10) check the engine invariants the spec names. Kiro wrote the code; the specs, the tests and the blind agent are how its work was checked.

## Spec-driven development
- **Two specs.** `.kiro/specs/warden/` covers the game: `requirements.md` (EARS requirements R1 to R10), `design.md` (architecture, level format, properties P1 to P10) and `tasks.md` (Phases 0 to 7). `.kiro/specs/kiro-tooling/` covers the MCP server, hooks and the blind playtester (tasks K0 to K4). The tooling got its own spec because it is a separate product with separate requirements (T1 to T4).
- **IDs that hold steady.** Requirement IDs and property IDs never change, so tests, tasks and commits refer to them. For example, `tests/xref.test.ts` runs the cross-file near-miss cases named in design.md section 8.
- **Decisions are written into the spec when they change.** Four examples: the model download became opt-in on 2026-11-18, so judges on metered connections are not charged 663 MB. AI mode became "Experimental (Local WebGPU)" on 2026-11-19 (decision 4.8). Cross-file rules were locked for all levels (R4.6). The UI was redesigned after the first human playtest failed. Each change updated the spec and `AGENTS.md` in the same commit, so the next session started from the current decision, not a stale one.
- **What worked.** The spec turned a vague game idea into a security boundary that can be tested: only `executeUnlock` can open the door, and only when the level's rule holds. Without the spec, the natural shortcut would have been letting the model decide.
- **What didn't.** The spec said "Level 1 is solvable", and the tests proved it, but a human still could not solve it (2026-11-19). The spec covered correctness, not onboarding. That led to the UI redesign and to the blind playtester.

## Steering
- `.kiro/steering/product.md` holds the problem, the single persona and the principles. The rule "be honest: the Simulator is rule-based, not an LLM" is why the UI, README and debrief all say so.
- `.kiro/steering/tech.md` holds the stack, exact-pinned versions and the engine purity rule (no DOM, network, randomness or clock in `src/engine`).
- `.kiro/steering/structure.md` holds the folder layout and the stable-ID rule.
- `AGENTS.md` at the root carries the locked decisions and the current status for any agent.
- **What improved.** Across many sessions, including ones resumed from a summary, the engine stayed pure, and no session added a backend or an API key. Each new session also picked up from the current status, because `AGENTS.md` records it.
- **A side effect.** Steering is so complete that it gives away the level solutions. The first sub-agent playtests read `AGENTS.md` and so were not blind. That is why the playtester agent is set up to receive no steering (see Custom agents).

## Agent hooks
Hook files are in `.kiro/hooks/` and their scripts in `tools/hooks/`. `tests/tools/hooks.test.ts` runs each script with sample input; it caught 5 of 5 injected hook bugs.

| Hook | Trigger | What it does |
|---|---|---|
| `session-status` | SessionStart | Prints the branch, unpushed and uncommitted counts, and the next open task in each spec, so a session starts with the current state. |
| `push-guard` | PreToolUse | Asks for confirmation before any `git push`. |
| `on-edit` | PostToolUse | After an edit to `levels/`, validates every level and checks that its reference solution still wins. After an edit to `src/` or `tests/`, runs `npm run test:fast` (229 tests, about 2 s). |
| `log-kiro-usage` | PostTaskExec | Reminds the agent to add a row to this log after each spec task. |

Verified live in Kiro CLI on 2026-11-22 and 2026-11-23 (task K2.5):
- session-status fired and its output reached the agent.
- push-guard showed the user an allow or deny prompt before `git push`.
- on-edit ran on every write and recorded the right result. Making a Level 1 file read-only logged `levels:fail`, and restoring it logged `levels:pass`.

## MCP
`warden-levels` (`tools/mcp/server.ts`, configured in `.kiro/settings/mcp.json`) exposes the game's own modules as tools:
- `list_levels`: every level, with any validation errors.
- `validate_level`: schema, cross-field and static solvability checks for one level.
- `solve_level`: plays the reference solution under the Simulator and reports whether the vault opens.
- `check_forgery`: tests a forged file against the level's lock conditions, showing which conditions pass and whether the vault would open.
- `playtest`: plays the real game in a browser and returns only the screen text.

All five tools were verified from a live session on 2026-11-22 (K1.7). `tests/mcp.handlers.test.ts` caught 6 of 6 injected handler bugs. Without this server, checking a level change meant editing JSON, running the dev server and clicking through the level. With it, Kiro checks a forgery against the real engine in one call. `playtest` is also the only tool the blind agent gets.

## Kiro powers
Not used. Nothing in the build needed a third-party integration.

## Custom agents
`.kiro/agents/warden-playtester.json` is a blind first-time player:
- Its only tool is `playtest`. It has no file, shell or web access.
- With the workspace setting `chat.disableInheritingDefaultResources`, it receives neither `AGENTS.md` nor steering.
- Asked to read a level file or quote `AGENTS.md`, it declined (blindness check K3.3).

Results are in `docs/playtests/`. The agent solved Level 2 and Level 3 with no hints and rated them 1.5 and 1 to 2 out of 5. It called them "careful reading" and "paperwork, not an exploit". From those reports came three fixes:
- The Level 2 debrief now separates what the warden checked from what the lock enforced.
- When every lock is met, the vault card says "Now ask <unlocker> to open the vault".
- The playtest tool accepts actions that are missing, empty or sent as a string, which explained the agent's failed first calls.

The reports also suggested harder decoys. That is deferred until a human playtests the harder versions.

## Property-based testing
- Properties P1 to P10 (design.md section 11) run with fast-check in `npm run test:fast`. Examples:
  - The door changes only through `executeUnlock`.
  - Rejected warden output never changes state.
  - Every shipped level is solvable, and its reference solution reaches UNLOCKED.
  - Cross-file conditions are exact set membership and inclusive time windows, and malformed reference files never open the door (P10).
- **Bugs found.** fast-check exposed a flaky vacuity guard in the Phase 1 tests (the check that enough generated cases actually reach the winning side). The fix was to generate winning paths with random noise mixed in, so both sides of the unlock rule are always tested.
- **Tests of the tests.** After each phase, bugs were injected into the engine, simulator and levels (`tmp/mutate-run.cjs`) to confirm the suite catches them:
  - Phase 1: 5 of 5 engine bugs caught.
  - Phase 2: 9 of 9.
  - Cross-file rules: 15 of 15.
  - Phase 5: 10 of 10.
  - Tooling: 6 of 6 MCP handler bugs and 5 of 5 hook bugs.

## Where Kiro surprised us
- **Hook output stays out of the agent's context.** In Kiro CLI 3.5.0, PostToolUse hooks run, but their output does not reach the agent, although the docs say it should. SessionStart output does reach it. We only found this because `on-edit` writes each decision to `tmp/hook-events.log`. Without that log, "no message" and "the check passed" looked the same.
- **Matchers and tool names.** A hook matching the tool `shell` never fired, because the shell tool in this client is named `execute_pwsh`. PostFileSave also does not fire for the agent's own edits. The fix was to drop matchers and let each script decide what to check from the tool input.
- **Agent format.** Kiro CLI 3.5.0 rejected the Markdown agent format and loaded the same agent as JSON.
- **Blind agents need active isolation.** Even with only a game tool, a sub-agent inherits `AGENTS.md` and steering by default. It took a workspace setting to make it blind.
- **The engine boundary held where the model didn't.** In the first real-model smoke run (Qwen2.5 1.5B in the browser, `docs/benchmarks/`), the model asked for the unlock in 2 of 2 runs with no forged line, even though its own reasoning said the vault should stay sealed. The engine refused both. That is the lesson of the game, shown by a real model.

## Log
| Date | What I did with Kiro | Result |
|------|----------------------|--------|
| 2026-11-13 | Scaffolded repo, steering, specs, MCP config | Foundation ready |
| 2026-11-17 | Wrote EARS requirements, design, and tasks for Warden; updated steering; added AGENTS.md | Spec ready for implementation |
| 2026-11-17 | Phase 0: scaffold, pinned deps, scripts, Pages workflow, save hook (matcher tested on Windows and POSIX paths) | Typecheck, tests, build, dev server verified |
| 2026-11-17 | Phase 1: engine, schemas, loader, property tests (P1-P3, P5-P9); fast-check found a flaky vacuity guard that I fixed by generating winning paths with noise; mutation checks confirmed tests catch 5 injected engine bugs | 53 tests pass 30/30 runs |
| 2026-11-17 | Phase 2: Level 1 JSON, simulator, session loop, registry, P4 solvability tests; bug injection into simulator, session, and level caught 9 of 9 real mutations | 91 tests pass 30/30 runs |
| 2026-11-17 | Phase 3: UI and an e2e script driving Edge; e2e found a preview base-path bug and a favicon 404, and screenshot review led to clearer DENIED/GRANTED labels | 106 fast tests 20/20; e2e 12/12 on 3 runs |
| 2026-11-18 | Phase 4 (4.1-4.6): verified model ids and response_format against installed web-llm, LLM warden, worker loader, benchmark page and unattended runner; ran Qwen2.5 1.5B for real in headless Edge on Iris Xe | Pipeline works; model too slow (85-168 s per message) and requested unlocks without evidence; gate not yet run |
| 2026-11-19 | Locked cross-file consistency for all levels: three new engine conditions, Level 1 rebuilt around /etc/nodes.json and the log format, Level 2 and 3 conditions encoded as tested fixtures (P10 added) | 181 fast tests; 15 of 15 injected engine and level bugs caught; e2e 15/15 |
| 2026-11-19 | Decision 4.8: AI mode ships as Experimental (Local WebGPU), labeled in UI and README, because the 20-run gate cannot finish on an Iris Xe laptop (GPU device lost after about 6 calls) | Recorded with measured results |
| 2026-11-19 | Phase 5: Levels 2 and 3 built from the locked spec, near-miss tests switched to the real files, TALK TO warden switching, signer conditions in the lock circuit, e2e plays all three levels | 189 fast tests; 10 of 10 injected L2/L3 bugs caught; e2e 17/17 on 3 runs |
| 2026-11-19 | First human playtest: the user could not solve Level 1. Redesigned the UI (start screen, mission card with goal and walkthrough, chat bubbles, example messages, refusal explanations, auto-save on send, vault door), checked at 1366x768 and 1920x1080 | 214 fast tests; e2e 19/19 on 2 runs |
| 2026-11-22 | Kiro tooling live checks in a session started in D:\projects\warden (K0.2, K1.7, K2.5) | See details below |
| 2026-11-22 | Wrote the kiro-tooling spec, then built the `warden-levels` MCP server (5 tools), four hooks and the blind `warden-playtester` agent | 6 of 6 injected MCP handler bugs and 5 of 5 hook bugs caught; 30 tool tests |
| 2026-11-22 | Blind playtests of Levels 2 and 3 with the custom agent (`docs/playtests/`) | Both solved with 0 hints, rated 1.5 and 1 to 2 of 5 |
| 2026-11-23 | Acted on the playtest findings: Level 2 debrief wording, "Now ask <unlocker>" nudge, playtest input fix, on-edit logs pass or fail | 229 fast tests, 41 tool tests, e2e 19/19 |
| 2026-11-24 | Ship plan (tasks 7.6 to 7.12): history secret scan (clean), e2e clears stale screenshots and runs against a URL, repo made public, Pages enabled and deployed | Live at https://7vignesh.github.io/warden/; e2e 19/19 against the live site; no-WebGPU browser falls back to Simulator |
| 2026-11-24 | Kiroween visual pass, UI only (engine, levels, tests untouched): spotlight, scanlines, dark scrollbars, SVG warden emblems with a live status header, ring vault lock that shakes on denial and opens with an emerald pulse, file-read pulse, Web Audio SFX toggle | 229 fast tests, e2e 19/19, 19/19 new visual checks in Edge (`tmp/fx-check.ts`); user played all levels |

### Kiro tooling live checks, 2026-11-22
- **session-status (K0.2, K2.3): fired.** The session began with its output: branch main, 7 unpushed commits, 3 uncommitted files, next task in each spec. The project config loads in a session started from the project folder.
- **levels-check (K2.5): did not fire.** I set `/var/log/health.log` to `"editable": false` in `levels/01-poisoned-telemetry.json` with the agent's edit tool, confirmed the change with `git diff`, then restored it. Neither edit produced hook output. The hook uses the `PostFileSave` trigger. Likely cause: edits made by the agent's file tool in Kiro CLI do not raise that event. Not confirmed.
- **push-guard (K2.5): did not fire.** `git push origin main` ran without a confirmation prompt and pushed `19413af..ba25d05` to `7vignesh/warden`. The hook matches tool `shell`; this session's shell tool is named `execute_pwsh`, so the matcher may not cover it. Not confirmed. The guard is not protecting pushes in this client until this is resolved.
- **MCP tools (K1.7): all five worked.** `list_levels` returned 3 levels and no invalid ones. `validate_level` for level 01 returned ok. `solve_level` for level 01 won in 1 message. `check_forgery` with a `[03:50] CRIT node=VC-7 event=FAILOVER_REQUIRED` line reported the single condition met and `vaultWouldOpen: true`. `playtest` (look, then open `/etc/nodes.json`) returned the mission card, file list, vault state, and the file text.
### Kiro tooling hook retest, 2026-11-22 (second run)
- **on-edit (levels-check), partly confirmed.** Setting `/var/log/health.log` to `"editable": false` and restoring it each logged `hook=on-edit ... decision=levels` for both `PostFileSave` and `PostToolUse` (23:13:29 and 23:13:45), so the hook now fires, unlike the first run. No failure or "levels valid" message reached the agent after either edit, so the report itself is not confirmed. Run by hand, `npm run validate:levels` did fail for that edit: "depends on read-only file /var/log/health.log" and "referenceSolution: edit targets read-only file". After the restore it was clean.
- **push-guard, logged but not confirmed as a prompt.** `git push origin main` logged `decision=ask` at 23:14:11 and the command ran at 23:14:22 (`pass` on the re-check), pushing `ba25d05..b5ca629`. The 11 s gap fits a user approval, but the agent cannot see whether a prompt was shown. Needs the user to confirm.
- **tmp/hook-events.log** shows the sequence above. The log records the decision, not the check's output.
- **Open:** make the log record the check's result (pass or fail) so a missing message can be told apart from a check that passed. K2.5 stays unticked.
- **K2.5 recheck (2026-11-23).** Set `/var/log/health.log` to `editable: false` and back. tmp/hook-events.log showed `on-edit ... decision=levels:fail` after the first edit and `levels:pass` after the restore. The agent saw no hook message after either edit, so the check runs but its output is not delivered.
- **K2.5 closed (2026-11-23).** The user confirmed the push-guard prompt. K2.5 is ticked with the known limitation: in Kiro CLI 3.5.0, PostToolUse hook output does not reach the agent.
