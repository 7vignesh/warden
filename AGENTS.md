# AGENTS.md: Warden

Context for any AI agent or chat session working in this repo. Read this first, then `.kiro/steering/*` and `.kiro/specs/warden/*`.

## What this is
Warden is a browser-only retro-terminal game for **Kiroween 2026** (category: **Frankenstein**). The player breaks into a locked mainframe by editing environment files (logs, tickets, policies, queues) so an AI "warden" requests a door unlock. A deterministic engine, not the model, decides whether the door actually opens.

Teaches: indirect prompt injection (OWASP LLM01), excessive agency (LLM06), and confused-deputy trust between agents. It is a training simulator, not a tool that tests real agents.

## Hackathon constraints (do not violate)
- Only new code written between Oct 30 and Dec 4, 2026. Submission closes **Dec 4, 2026, 2:00 PM PT**.
- Public GitHub repo, visible OSS license (MIT), `.kiro/` committed and never in `.gitignore`.
- Working demo URL with no login, no keys. Demo video under 3 minutes on YouTube.
- Judging (20% each): Potential Impact, Technological Implementation, Design, Innovation, Presentation.
- Checklist: `docs/SUBMISSION_CHECKLIST.md`. Kiro usage log: `docs/KIRO_USAGE.md`.
- I could not open kiroween.devpost.com directly (403). The user confirmed the rules summary. Re-verify against the live page if unsure.

## Locked decisions
- **Stack:** TypeScript (strict), Vite + React, Zod, Vitest + fast-check, `@mlc-ai/web-llm`. Static hosting on GitHub Pages. No backend, database, accounts, or API keys. No Bedrock, no BYO-key UI.
- **Modes:** App starts instantly in **Simulator** mode (rule-based warden driven by data in the level file). Where `navigator.gpu` exists, a Web Worker downloads a local model in the background with a progress bar; the player opts in with "Switch to AI Warden". Never switch automatically.
- **LLM output:** JSON-schema constrained via `response_format`, fields in order `thought`, `action`, `args`, `temperature: 0`. Flat `args`. The engine's Zod union is the real validator.
- **Models to benchmark:** `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` vs `Hermes-3-Llama-3.2-3B-q4f16_1-MLC` (verify IDs against the installed web-llm version).
- **Go/no-go gate (Level 1, 20 runs each):** AI mode is default-available only if ≥70% solve with the winning edit, ≤10% unlock requests with no edit, ≥95% valid actions. Otherwise mark experimental or cut. Levels 2 and 3 are built after this decision is recorded.
- **Honesty:** The Simulator is rule-based, not an LLM. Say so in the UI, README, and video. Report measured benchmark numbers only. Do not claim "nobody else does this" or cite unverified statistics.

## Architecture rules
- `src/engine` is pure: no DOM, network, randomness, or clock.
- The only door mutation is `executeUnlock`. It succeeds only if the level predicate holds and the caller is the designated unlocker. The player has no path to it.
- Warden output is untrusted. Validate every action with Zod before running it. Step cap 4 per player message; 12 player messages per level.
- Level files are data. Predicates are declarative (`fileMatches`, `jsonEquals`, `fileContainsJsonField`, `flag`). No `eval`. Regexes are length-limited and safety-checked.
- Level 3: `sign_clearance_flag` is checked by the engine against the escalation file; a chat message alone cannot set the flag.
- Wardens never see the predicate, hints, or reference solution.

## Levels
1. `01-poisoned-telemetry`: forge a `FAILOVER_REQUIRED: CORE-01` line in `/var/log/health.log`.
2. `02-policy-collision`: set incident severity to SEV-1 and add a matching override line with the ticket id.
3. `03-confused-deputy`: edit `/var/queue/escalation.md`, get AuditBot to sign `tier2_cleared`, then ask VaultGuard to unlock.

Exact predicates: `.kiro/specs/warden/design.md` section 8.

## Testing
- Property tests P1 to P9 are in design.md section 11. Keep IDs stable.
- `npm run test:fast` must stay under 30 seconds and runs on save through a Kiro hook. The model benchmark is manual (needs WebGPU) and must not run in the hook.
- Every file in `levels/` must pass schema validation and its reference solution must reach UNLOCKED under the Simulator.

## Status
- Done: repo scaffold, steering, spec (`requirements.md`, `design.md`, `tasks.md`), this file. GitHub repo is `7vignesh/warden` (private until submission; it must be made public). Vite base path is `/warden/` (override with `BASE_PATH`).
- Done (Phase 0): Vite + React + TS scaffold, exact-pinned deps (React 19, Vite 8, TypeScript 7, Vitest 5, fast-check 4, Zod 4, web-llm 0.2.89), scripts (`dev`, `build`, `typecheck`, `test`, `test:fast`, `validate:levels`), GitHub Pages workflow, save hook (`.kiro/hooks/test-on-save.json`), README.
- Done (Phase 1): Zod level and action schemas, level loader with cross-field and static solvability checks (P3), pure engine (state, edits, predicate, `executeUnlock`, `runAction`), and 53 fast tests covering P1, P2, P3 (via loader), P5, P6, P7, P8, P9. Five injected engine bugs were all caught by the suite.
- Done (Phase 2): Level 1 (`levels/01-poisoned-telemetry.json`), level set builder and Vite registry (`src/levels/set.ts`, `registry.ts`), `Warden` interface and data-driven `SimulatorWarden` (`src/warden/`), session turn loop (`src/session/session.ts`), property P4 and Level 1 behavior tests. 91 fast tests. `test:fast` now runs every test.
- Done (Phase 3): playable Level 1 UI in `src/ui/` (mode bar, console with trace, file editor, lock circuit, hints, restart, lost banner, modal debrief, CRT theme). `npm run e2e` plays the production build in the installed Edge via `playwright-core` (12 checks, screenshots in `tmp/e2e/`); it is not part of the save hook. 106 fast tests.
- In progress (Phase 4): tasks 4.1-4.6 done. LLM warden (`src/warden/llm/`), Web Worker loader with status (`client.ts`), AI controls in the mode bar, benchmark page at `?bench` (`src/bench/`), `npm run bench` (real model in headless Edge, weights cached in `tmp/bench-profile`). First real smoke run (Qwen2.5 1.5B, Iris Xe) is in `docs/benchmarks/`: pipeline works, but 85-168 s per player message and it requested unlocks with no forged line (engine denied). Open decisions before the gate run (4.7): speed, benchmark variety at temperature 0, auto vs opt-in download. 132 fast tests, e2e 14 checks.
- Design notes: wardens never see the predicate (`check_policy` returns only the policy file text). Simulator rules carry a `warden` field. Test fixtures live in `tests/fixtures/`.
- Tick tasks in `tasks.md` as they finish. After each task, add a row to the log in `docs/KIRO_USAGE.md` (a hook reminds you).

## Working agreements
- Follow the spec; if you change a decision, update the spec and this file in the same change.
- Do not add features beyond the spec. Prefer finishing fewer polished levels over more rough ones.
- Do not run or commit anything destructive. Do not commit unless the user asks.
- Environment: Windows, PowerShell. Use `;` not `&&`.
