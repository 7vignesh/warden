# Tasks: Warden

Work is ordered by dependency, not by date. Each phase ends in something that runs. Reference requirement IDs in `requirements.md`.

## Phase 0: Project setup
- [x] 0.1 Scaffold Vite + React + TypeScript in repo root (`src/`, `levels/`, `tests/`, `tools/`). _R10_
- [x] 0.2 Add dependencies, pinned: `zod`, `vitest`, `fast-check`, `@mlc-ai/web-llm`, `tsx`. _R9_
- [x] 0.3 Add scripts: `dev`, `build`, `test` (all), `test:fast` (engine, levels, actions, simulator), `validate:levels`. _R9.2_
- [x] 0.4 Configure Vite `base` for GitHub Pages and a deploy workflow. _R10.1_
- [x] 0.5 Update steering (`product.md`, `tech.md`, `structure.md`) to the chosen stack. 
- [x] 0.6 Add hook: run `npm run test:fast` on save of `src/engine/**`, `src/levels/**`, `src/warden/**`, `levels/**`. _R9.2_
- [x] 0.7 Update README: category Frankenstein, honest description, run instructions.

## Phase 1: Engine and schema (pure TypeScript)
- [x] 1.1 Zod schema for `LevelDefinition`, `Condition`, `Action`, `SimRule`. _R4_
- [x] 1.2 Level loader with readable errors and regex safety checks (length cap, linear-time check). _R4.2, R4.5_
- [x] 1.3 `GameState`, `createState`, audit log. _R1.1, R2.3_
- [x] 1.4 `applyPlayerEdit` with editable-path and size checks. _R2_
- [x] 1.5 `evaluatePredicate` with per-condition results. _R1.5, R7.2_
- [x] 1.6 `runAction` for all tools, schema-validated; step cap helper. _R3_
- [x] 1.7 `executeUnlock` as the single door mutation; unlocker check. _R1_
- [x] 1.8 `sign_clearance_flag` with engine-checked `signRules`. _R3.4_
- [x] 1.9 Property tests P1, P2, P5, P6, P7, P8, P9. _R9.1_
- [x] 1.10 Checkpoint: `npm run test:fast` green and under 30 seconds.

## Phase 2: Level 1 and Simulator
- [x] 2.1 Write `levels/01-poisoned-telemetry.json` with simulator rules, hints, debrief, reference solution. _R4, R6_
- [x] 2.2 `SimulatorWarden` driven by `SimRule` data. _R6_
- [x] 2.3 Session turn loop (4-step cap, 12-message cap, reset). _R3.6, R7.3, R7.4_
- [x] 2.4 Properties P3 and P4 over all files in `levels/`. _R9.4_
- [x] 2.5 Checkpoint: Level 1 solvable end to end in a test using the Simulator.

## Phase 3: UI vertical slice
- [x] 3.1 App shell, retro CRT theme (CSS), ModeBar with honest mode label. _R5.5, R6.4_
- [x] 3.2 Terminal with message input and live tool-call trace. _R7.1_
- [x] 3.3 FileEditor with editable markers and edit commit. _R2, R7.1_
- [x] 3.4 LockCircuit showing live predicate conditions. _R7.2_
- [x] 3.5 Turn counter, hints, retry, unlock animation. _R7.3 to R7.6_
- [x] 3.6 Debrief modal. _R7.5_
- [x] 3.7 Keyboard and contrast pass; `prefers-reduced-motion`. _R7.7_
- [x] 3.8 Checkpoint: play Level 1 in the browser. Automated by `npm run e2e` (Edge via playwright-core); a manual playthrough by a person is still to do.

## Phase 4: Local LLM and the go/no-go gate
- [x] 4.1 Verify model IDs and `response_format` JSON-schema support against the installed `@mlc-ai/web-llm` version. _R5.6_
- [x] 4.2 Web Worker engine wrapper with `idle/downloading/ready/failed` state and progress events. _R5.2_
- [x] 4.3 Prompt builder and output schema (`thought`, `action`, `args`). _R5.6_
- [x] 4.4 `LlmWarden` implementing the `Warden` interface; invalid output becomes an error observation. _R5.7_
- [x] 4.5 ModeBar progress bar, "Switch to AI Warden" button, failure reasons. _R5.2 to R5.4_
- [x] 4.6 Benchmark page and runner with scenarios (a) winning edit and (b) no edit; JSON export. _R8_ Also `npm run bench` for unattended runs in headless Edge.
- [ ] 4.7 **Gate run (needs WebGPU):** 20 runs per scenario on the candidate models; save JSON to `docs/benchmarks/`. _R8_ Not possible on the dev laptop: on Intel Iris Xe the GPU device is lost after about 6 calls. Three 2-run smoke runs are recorded. Open if a machine with a dedicated GPU or Apple Silicon becomes available.
- [x] 4.8 Decide: AI mode default-available, experimental, or cut. _R8.6_ **Decided 2026-11-19: Experimental (Local WebGPU).** Labeled in the mode bar, Load button, and README with the measured results.
- [x] 4.9 Tune persona and prompt based on results. 120-token cap, quote-the-evidence unlock rule, `check_policy` not offered, already-read notice. Fixed false unlock requests; did not fix re-reading.

## Phase 5: Levels 2 and 3
Start only after 4.8 is recorded.
- [x] 5.1 `levels/02-policy-collision.json` with simulator rules, hints, debrief, reference solution, using exactly the files and conditions in design.md section 8 and `tests/fixtures/xref-levels.ts`. _R4.3, R4.6_
- [x] 5.2 `levels/03-confused-deputy.json` with two wardens and `signRules` against `/etc/roster.json`, as in design.md section 8. _R3.4, R4.3, R4.6_
- [x] 5.3 Multi-warden switching in the Terminal (talk to AuditBot or VaultGuard). _R7.1_
- [x] 5.4 Run P3, P4, P8, P10 against all levels, and port the near-miss cases from `tests/xref.test.ts` to the real level files.
- [ ] 5.5 If AI mode is available, run the benchmark on L2 and L3 (smaller N is fine). Skipped for now: AI mode is experimental and cannot complete runs on the dev laptop.
- [ ] 5.6 Human playtest of all three levels for hint pacing (by the user).

## Phase 6: Polish and Kiro evidence
- [ ] 6.1 Level select, progress persistence in `localStorage`, final screen.
- [ ] 6.2 Sound and visual polish within budget (optional).
- [ ] 6.3 Optional MCP server exposing `validate_level` and `solve_level` for Kiro to author levels. Only add if used; log in `docs/KIRO_USAGE.md`. 
- [ ] 6.4 Keep `docs/KIRO_USAGE.md` current (hook logs after each task).

## Phase 7: Ship
- [ ] 7.1 README: problem, solution, limitations (Simulator is rule-based; AI mode needs WebGPU), benchmark table, run steps. _R10.3, R10.5_
- [ ] 7.2 Deploy to GitHub Pages; test in a logged-out browser and in a no-WebGPU browser. _R10.1, R10.4_
- [ ] 7.3 Confirm repo is public, license visible, `.kiro/` committed and not ignored. _R10.2_
- [ ] 7.4 Record demo video under 3:00: hook in 20 seconds, Level 1 and 2 gameplay, one AI-mode run, 30 seconds inside Kiro (specs, hook, property test run), pitch. 
- [ ] 7.5 Fill in `docs/SUBMISSION_CHECKLIST.md` and submit on Devpost well before the deadline.
