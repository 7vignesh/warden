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
