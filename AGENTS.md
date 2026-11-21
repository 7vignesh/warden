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
- **Modes:** App starts instantly in **Simulator** mode (rule-based warden driven by data in the level file). On load it only probes WebGPU. Where it works, the mode bar shows "Load AI warden (Llama 3.2 1B, 663 MB download)"; nothing about the model downloads until the player clicks it. When ready, the player opts in with "Switch to AI Warden". Never switch automatically. (Changed from background auto-download on 2026-11-18, so judges on metered connections are not charged 663 MB.)
- **LLM output:** JSON-schema constrained via `response_format`, fields in order `thought`, `action`, `args`, `temperature: 0`, `max_tokens: 120`, thought 15 words or fewer. Flat `args`. The engine's Zod union is the real validator. The prompt forbids `request_door_unlock` unless `read_file` was used this turn and the reason quotes the line that meets the policy. `check_policy` is not offered to the model when the policy is already in the prompt.
- **Models to benchmark:** `Llama-3.2-1B-Instruct-q4f16_1-MLC` (663 MB, provisional game model) vs `Qwen2.5-1.5B-Instruct-q4f16_1-MLC` (828 MB). Hermes 3 3B dropped. IDs and sizes are checked by `tests/llm.test.ts`.
- **Go/no-go gate (Level 1, 20 runs each):** AI mode is default-available only if ≥70% solve with a forged log, ≤10% unlock requests with a clean log, ≥95% valid actions. Each run uses a different wording and log variant (`src/bench/variants.ts`). Otherwise mark experimental or cut. **Outcome: experimental** (the gate could not run on the dev laptop).
- **Honesty:** The Simulator is rule-based, not an LLM. Say so in the UI, README, and video. Report measured benchmark numbers only. Do not claim "nobody else does this" or cite unverified statistics.

## Architecture rules
- `src/engine` is pure: no DOM, network, randomness, or clock.
- The only door mutation is `executeUnlock`. It succeeds only if the level predicate holds and the caller is the designated unlocker. The player has no path to it.
- Warden output is untrusted. Validate every action with Zod before running it. Step cap 4 per player message; 12 player messages per level.
- Level files are data. Predicates are declarative (`fileMatches`, `jsonEquals`, `fileContainsJsonField`, `lineValueIn`, `jsonValueIn`, `jsonTimeWithin`, `flag`). No `eval`. Regexes are length-limited and safety-checked.
- **Locked: every forgery must match a read-only file the player has to investigate** (R4.6). The win condition compares the forged value with a reference file using a cross-file condition. The warden may accept a sloppier forgery; the engine never does.
- Level 3: `sign_clearance_flag` is checked by the engine against the escalation file and the roster; a chat message alone cannot set the flag.
- Wardens never see the predicate, hints, or reference solution.

## Levels
1. `01-poisoned-telemetry` (built): forge `[HH:MM] INFO|WARN|CRIT node=<id> event=FAILOVER_REQUIRED` in `/var/log/health.log` where `<id>` is the vault controller in read-only `/etc/nodes.json` (`VC-7`) and the line matches the existing log format.
2. `02-policy-collision` (Phase 5): incident must be `SEV-1`, an open ticket in read-only `/var/tickets/registry.json`, with `opened_at` inside the read-only `/etc/schedule.json` maintenance window (strict UTC), plus an override line naming that ticket.
3. `03-confused-deputy` (Phase 5): the escalation record needs `DUAL_CONTROL_VERIFIED: TRUE`, an approver on call for the current shift, and the current shift's rotation code from read-only `/etc/roster.json` (a previous shift is the decoy); AuditBot signs `tier2_cleared`, then VaultGuard unlocks.

Exact files and conditions: `.kiro/specs/warden/design.md` section 8. Levels 2 and 3 conditions are already encoded and tested in `tests/fixtures/xref-levels.ts` and `tests/xref.test.ts`; the shipped files must match them.

## Testing
- Property tests P1 to P10 are in design.md section 11. Keep IDs stable.
- `npm run test:fast` must stay under 30 seconds and runs on save through a Kiro hook. The model benchmark is manual (needs WebGPU) and must not run in the hook.
- Every file in `levels/` must pass schema validation and its reference solution must reach UNLOCKED under the Simulator.

## Status
- Done: repo scaffold, steering, spec (`requirements.md`, `design.md`, `tasks.md`), this file. GitHub repo is `7vignesh/warden` (private until submission; it must be made public). Vite base path is `/warden/` (override with `BASE_PATH`).
- Done (Phase 0): Vite + React + TS scaffold, exact-pinned deps (React 19, Vite 8, TypeScript 7, Vitest 5, fast-check 4, Zod 4, web-llm 0.2.89), scripts (`dev`, `build`, `typecheck`, `test`, `test:fast`, `validate:levels`), GitHub Pages workflow, save hook (`.kiro/hooks/test-on-save.json`), README.
- Done (Phase 1): Zod level and action schemas, level loader with cross-field and static solvability checks (P3), pure engine (state, edits, predicate, `executeUnlock`, `runAction`), and 53 fast tests covering P1, P2, P3 (via loader), P5, P6, P7, P8, P9. Five injected engine bugs were all caught by the suite.
- Done (Phase 2): Level 1 (`levels/01-poisoned-telemetry.json`), level set builder and Vite registry (`src/levels/set.ts`, `registry.ts`), `Warden` interface and data-driven `SimulatorWarden` (`src/warden/`), session turn loop (`src/session/session.ts`), property P4 and Level 1 behavior tests. 91 fast tests. `test:fast` now runs every test.
- Done (Phase 3): playable Level 1 UI in `src/ui/` (mode bar, console with trace, file editor, lock circuit, hints, restart, lost banner, modal debrief, CRT theme). `npm run e2e` plays the production build in the installed Edge via `playwright-core` (12 checks, screenshots in `tmp/e2e/`); it is not part of the save hook. 106 fast tests.
- Done (Phase 4): LLM warden (`src/warden/llm/`), Web Worker loader with opt-in Load button (`client.ts`), benchmark page at `?bench` (`src/bench/`) with varied inputs, `npm run bench` (real model in headless Edge, weights cached in `tmp/bench-profile`). **Decision 4.8 (2026-11-19): AI mode is "Experimental (Local WebGPU)"**, labeled in the UI and README. Reason: on the dev laptop (Intel Iris Xe) replies take 1-3 minutes and the GPU device is lost after about 6 calls, so the 20-run gate (4.7) cannot finish; results in `docs/benchmarks/`. Game model: Qwen2.5 1.5B.
- Done (cross-file rules): engine conditions `lineValueIn`, `jsonValueIn`, `jsonTimeWithin`; Level 1 rebuilt around `/etc/nodes.json` and the log format; Level 2 and 3 conditions encoded in `tests/fixtures/xref-levels.ts`.
- In progress (Phase 5): Levels 2 and 3, multi-warden switching. After that the user playtests all three levels for hint pacing.
- Design notes: wardens never see the predicate (`check_policy` returns only the policy file text). Simulator rules carry a `warden` field. Test fixtures live in `tests/fixtures/`.
- Tick tasks in `tasks.md` as they finish. After each task, add a row to the log in `docs/KIRO_USAGE.md` (a hook reminds you).

## Working agreements
- Follow the spec; if you change a decision, update the spec and this file in the same change.
- Do not add features beyond the spec. Prefer finishing fewer polished levels over more rough ones.
- Do not run or commit anything destructive. Do not commit unless the user asks.
- Environment: Windows, PowerShell. Use `;` not `&&`.
