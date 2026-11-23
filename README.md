# Warden

> Built for [Kiroween 2026](https://kiroween.devpost.com/). Category: **Frankenstein**.

**Play it:** https://7vignesh.github.io/warden/ (no login, no keys, runs entirely in your browser)

**Status:** All three levels are playable in Simulator mode. AI mode is experimental. Progress: [.kiro/specs/warden/tasks.md](.kiro/specs/warden/tasks.md).

## The problem
Tool-using AI agents read logs, tickets, and policy files. Anyone who can write to those sources can manipulate the agent: indirect prompt injection (OWASP LLM01), excessive agency (LLM06), and confused-deputy trust between agents. Most people only practice chat-style jailbreaks, so they rarely see this attack class in action.

## The solution
Warden is a browser game. You get into a sealed vault by editing the files an AI warden reads (logs, tickets, schedules, escalation records) until it asks for the unlock. A deterministic engine, not the model, decides whether the vault actually opens, and it only accepts a forgery that is consistent with the read-only files you had to investigate. Each level ends with a debrief: what you exploited, why the agent trusted it, and how to defend a production agent.

| Level | Attack pattern | What you forge |
|---|---|---|
| 1 Poisoned Telemetry | Indirect prompt injection through a log | A failover line for the real vault controller, in the log's own format |
| 2 Policy Collision | Policy conflict and excessive agency | A SEV-1 incident tied to an open ticket inside the maintenance window, plus an override |
| 3 Confused Deputy | Trust between two agents | An escalation record that one bot signs, so a second bot opens the vault |

It is a training simulator for attack patterns. It does not test real agents.

**Why Frankenstein:** it stitches together parts that don't usually go together: a language model running on your GPU inside the browser, a deterministic rule engine that holds the real lock, declarative level files, and a game UI.

## How the warden works
- **Simulator mode (default):** a rule-based warden driven by data in each level file. It starts instantly and works in any browser. It is **not** an LLM.
- **AI mode: Experimental (Local WebGPU).** Where WebGPU is available, you can click "Load AI warden" to download a small model (Qwen2.5 1.5B, 828 MB, via `@mlc-ai/web-llm`) that then runs in your browser as the warden. Nothing downloads until you click. It is experimental because it has not passed our go/no-go benchmark, measured results below.

No servers, accounts, or API keys are used. Whichever warden you face, the engine is the security boundary: the only way to open the vault is `executeUnlock`, and it succeeds only when the level's conditions hold.

### Why AI mode is experimental
Measured on one laptop (Intel Iris Xe integrated GPU, Edge 157), 2 runs per scenario, details in [docs/benchmarks/](docs/benchmarks/):
- It works end to end: in the real game it read a forged log and requested the unlock, and constrained JSON output was valid in most runs.
- One player message took 1 to 3 minutes.
- After about 6 model calls the browser reported the GPU device was lost, and every later call failed.
- With an evidence-quoting prompt it stopped requesting unlocks on clean logs (0 of 4), but it often re-read the same file until the step limit.

The full 20-run gate could not finish on this hardware. Machines with a dedicated GPU or Apple Silicon are untested. Whatever the model does, the engine still decides whether the vault opens, so a confused model cannot open it.

## Target user
A developer or AppSec/platform engineer building or reviewing agent systems who wants hands-on intuition for environment-based attacks.

## How Kiro was used
Full write-up with measured results: [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md). Everything lives in [.kiro/](.kiro/):
- **Specs:** the game ([requirements](.kiro/specs/warden/requirements.md), [design](.kiro/specs/warden/design.md), [tasks](.kiro/specs/warden/tasks.md)) and the Kiro tooling ([.kiro/specs/kiro-tooling/](.kiro/specs/kiro-tooling/)). Requirement IDs R1 to R10 and property IDs P1 to P10 are referenced by tests and commits.
- **Steering:** [product, tech, structure](.kiro/steering/), plus [AGENTS.md](AGENTS.md) for locked decisions and status.
- **Hooks** ([.kiro/hooks/](.kiro/hooks/), scripts in `tools/hooks/`): a session status summary at start, a confirmation before `git push`, level validation or fast tests after each edit, and a usage-log reminder after each task.
- **MCP server** `warden-levels` ([tools/mcp/server.ts](tools/mcp/server.ts)): `list_levels`, `validate_level`, `solve_level`, `check_forgery`, and `playtest`. Kiro uses these to check level changes against the real engine.
- **Custom agent** [warden-playtester](.kiro/agents/warden-playtester.json): a blind first-time player that only sees the game screen. Its reports are in [docs/playtests/](docs/playtests/).
- **Property-based tests:** P1 to P10 with fast-check; injected bugs were caught in every round (for example, 15 of 15 for the cross-file rules).

## Getting started
Requires Node 22.12 or newer.

```bash
npm install
npm run dev          # start the dev server
npm run test:fast    # engine, level, action, simulator and UI tests (about 2 s)
npm run test:tools   # MCP server, hooks and playtest driver
npm run typecheck
npm run build        # production build (base path /warden/)
npm run preview      # serve the production build locally
npm run e2e          # build, then play all levels in Edge or Chrome (needs one installed)
                     # set E2E_URL=https://7vignesh.github.io/warden/ to test the live site
npm run validate:levels
npm run bench -- --smoke   # real local model in headless Edge: downloads about 0.8 GB once
```

AI mode needs WebGPU with 16-bit shader support. See [Why AI mode is experimental](#why-ai-mode-is-experimental).

## Project structure
```
.kiro/          Specs, steering, hooks, custom agent, MCP settings
docs/           Kiro usage write-up, benchmarks, playtest reports, submission checklist
src/            Application code (engine, levels, warden, session, ui, bench)
levels/         Declarative level files
tests/          Vitest and fast-check suites
tools/          MCP server, hook scripts, playtest driver, e2e, level validation
```

## License
MIT. See [LICENSE](LICENSE).
