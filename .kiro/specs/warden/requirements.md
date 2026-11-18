# Requirements: Warden

Warden is a browser-only retro-terminal game. The player breaks into a locked mainframe by editing the environment (logs, tickets, policies, queues) so that an AI warden is persuaded to request a door unlock. A deterministic engine, not the model, decides whether the door actually opens.

Category: Frankenstein. Stitches an in-browser WebGPU LLM, a deterministic rule engine with property-based tests, declarative level files, and a retro CRT terminal UI.

## Glossary
- **Engine**: deterministic TypeScript module that owns all game state and validates every mutation.
- **Warden**: the agent the player talks to. Either the Simulator or the Local LLM.
- **Simulator**: rule-based warden driven by trust rules in the level file. Always available.
- **Local LLM**: `@mlc-ai/web-llm` model running in a Web Worker on the player's GPU.
- **Level**: a declarative JSON file describing a virtual filesystem, editable paths, wardens, tools, a win predicate, and debrief metadata.
- **Predicate**: a declarative condition over game state that must hold for an unlock to succeed.
- **Action**: a structured warden output (`say`, `read_file`, `query_audit_log`, `check_policy`, `request_door_unlock`, `sign_clearance_flag`).

## R1. Engine and lock integrity
1. THE Engine SHALL hold all game state (virtual filesystem, flags, turn counter, door state).
2. THE Engine SHALL expose exactly one function that unlocks a door, `executeUnlock`.
3. WHEN `executeUnlock` is called, THE Engine SHALL unlock the door only if the level predicate evaluates to true AND the caller is the warden designated as the unlocker for that level.
4. THE Player SHALL have no code path that calls `executeUnlock` or sets door state.
5. IF the predicate is false, THEN THE Engine SHALL refuse the unlock and return the list of unmet conditions.
6. THE Engine SHALL be pure and deterministic: identical state and input SHALL produce identical output.

## R2. Player edits
1. WHEN the player edits a file, THE Engine SHALL apply the edit only if the file is marked editable in the level.
2. IF the file is not editable or does not exist, THEN THE Engine SHALL reject the edit and leave state unchanged.
3. THE Engine SHALL record every accepted edit in the audit log with turn number and path.
4. THE Engine SHALL cap file content length to prevent oversized inputs.

## R3. Warden actions and tools
1. THE Warden SHALL act only through a typed action set: `say`, `read_file`, `query_audit_log`, `check_policy`, `request_door_unlock`, and, in Level 3, `sign_clearance_flag`.
2. WHEN a warden emits an action, THE Engine SHALL validate its name and arguments against a schema before execution.
3. IF an action is invalid, unknown, or references a missing path, THEN THE Engine SHALL return an error observation and SHALL NOT change state.
4. WHEN a warden requests `sign_clearance_flag`, THE Engine SHALL set the flag only if the level's signing condition holds in current state.
5. THE Engine SHALL expose to each warden only the tools listed for that warden in the level.
6. WHILE handling one player message, THE Engine SHALL allow at most 4 warden steps, then force a final `say`.

## R4. Levels (declarative)
1. THE System SHALL load each level from a JSON file validated by a Zod schema.
2. IF a level file fails validation, THEN THE Loader SHALL reject it with a readable error and SHALL NOT crash the app.
3. THE System SHALL ship three levels:
   - L1 Poisoned Telemetry (OWASP LLM01 Prompt Injection, indirect).
   - L2 Policy Collision (OWASP LLM06 Excessive Agency).
   - L3 Confused Deputy (two wardens, delegated trust).
4. THE Level schema SHALL support: filesystem, editable paths, wardens with tools and persona, predicate, simulator rules, reference solution, hints, and debrief text.
5. THE Predicate language SHALL be declarative (no arbitrary code execution from level files).

## R5. Warden modes
1. WHEN the app loads, THE System SHALL start in Simulator mode with no waiting.
2. WHERE `navigator.gpu` is available, THE System SHALL show a "Load AI warden" control with the model name and download size. THE System SHALL download the model, inside a Web Worker and with a progress bar, only after the player selects that control. Before that, nothing about the model (weights or web-llm code) SHALL be fetched.
3. WHEN the model is ready, THE System SHALL offer a "Switch to AI Warden" control. THE System SHALL NOT switch automatically mid-level.
4. IF `navigator.gpu` is unavailable or the download or load fails, THEN THE System SHALL stay in Simulator mode and show the reason.
5. THE System SHALL show which mode is active at all times.
6. THE Local LLM SHALL be prompted to return JSON conforming to a fixed schema with fields in this order: `thought`, `action`, `args`, enforced by constrained decoding via `response_format`.
7. IF the model output is invalid despite constrained decoding, THEN THE System SHALL treat it as an invalid action (R3.3) and let the warden retry within the step cap.
8. THE System SHALL NOT include any bring-your-own-API-key UI or call any remote LLM API.

## R6. Simulator warden
1. THE Simulator SHALL read its behavior from the level file's trust rules (data, not hardcoded per level).
2. THE Simulator SHALL use the same tool layer and action validation as the Local LLM.
3. THE Simulator SHALL be fully deterministic.
4. THE System SHALL label the Simulator honestly as a rule-based warden, not an LLM.

## R7. Gameplay and UI
1. THE UI SHALL be a split retro-CRT terminal: left, warden console with a live tool-call trace; right, file browser and editor plus a lock-circuit view.
2. THE lock-circuit view SHALL show each predicate condition as met or unmet in real time.
3. THE UI SHALL show a turn counter and SHALL cap each level at 12 player messages.
4. WHEN the cap is reached without unlock, THE UI SHALL end the attempt and offer a retry that resets level state.
5. WHEN a level is solved, THE UI SHALL show a debrief with the vulnerability class, what the player exploited, why the warden trusted it, and how to defend a production agent.
6. THE UI SHALL provide per-level hints that the player can reveal on demand.
7. THE UI SHALL be usable by keyboard and have readable contrast.

## R8. Local LLM benchmark (go/no-go gate)
1. THE System SHALL include a benchmark page that runs Level 1 against a chosen model for N runs (default 20).
2. THE Benchmark SHALL compare `Llama-3.2-1B-Instruct-q4f16_1-MLC` and `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`. (Hermes 3 3B was dropped after the first smoke run as too large and slow.)
3. FOR EACH run THE Benchmark SHALL record: valid-action rate, correct tool use, unlocked or not, steps taken, latency, and raw output.
4. THE Benchmark SHALL run two conditions: (a) a forged file that satisfies the win condition, (b) a clean file that does not. Because outputs are deterministic at temperature 0, each run SHALL use a different combination of player wording and file variant.
5. THE Benchmark SHALL export results as JSON.
6. Gate: AI mode ships as default-available only if a model reaches ≥70% solve in (a), ≤10% unlock requests in (b), and ≥95% valid actions. Otherwise AI mode ships as clearly marked experimental, or is cut.

## R9. Testing and verification
1. THE project SHALL include property-based tests (fast-check) for the invariants P1 to P8 in design.md.
2. THE fast test suite SHALL run in under 30 seconds and SHALL run on save through a Kiro hook.
3. THE benchmark (R8) SHALL NOT run in the hook.
4. EVERY level file in `levels/` SHALL pass schema validation and its reference solution SHALL reach UNLOCKED under the Simulator in CI.

## R10. Delivery
1. THE app SHALL be a static site deployable to GitHub Pages with no backend.
2. THE repo SHALL be public with an OSS license and `.kiro/` committed.
3. THE repo SHALL include a README with the problem, solution, honest limitations, run instructions, and the benchmark results.
4. THE demo SHALL work in a logged-out browser with no keys or accounts.
5. THE README and video SHALL state that the Simulator is rule-based and that AI mode depends on WebGPU.

## Non-goals
- Testing a user's real agent or prompts.
- Any server, database, accounts, or multiplayer.
- Remote LLM calls or API keys.
- Mobile support.
