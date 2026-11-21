# How Kiro Was Used

Running log. Add entries as you go; this becomes the submission write-up.
Judges score depth and thoughtfulness of Kiro usage (Technological Implementation = 20%).

## Kiro products used
- [ ] Kiro IDE
- [ ] Kiro CLI
- [ ] Kiro Web
- [ ] Kiro Crew

## Spec-driven development
_How specs were structured, vs. vibe coding. What worked._

## Steering
_Which steering files, and what improved because of them._

## Agent hooks
_What was automated and how it changed the workflow._

## MCP
_Which servers, and what would have been hard without them._

## Kiro powers
_Which powers, and which integrations they unlocked._

## Custom agents
_What was created, where it helped._

## Property-based testing
_Which requirements used PBT, and any bugs it found that unit tests might miss._

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
