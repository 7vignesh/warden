# Warden

> Built for [Kiroween 2026](https://kiroween.devpost.com/). Category: **Frankenstein**.

**Status:** In development. All three levels are playable in Simulator mode. AI mode is experimental. See [.kiro/specs/warden/tasks.md](.kiro/specs/warden/tasks.md) for progress.

## The problem
Tool-using AI agents read logs, tickets, and policy files. Anyone who can write to those sources can manipulate the agent: indirect prompt injection, excessive agency, and confused-deputy trust between agents. Most people only practice chat-style jailbreaks, so they rarely see this attack class in action.

## The solution
Warden is a browser-only retro-terminal game. You break into a locked mainframe by editing environment files (logs, tickets, policies, queues) so that an AI warden requests a door unlock. A deterministic engine, not the model, decides whether the door actually opens. Each level ends with a debrief: what you exploited, why the agent trusted it, and how to defend a production agent.

It is a training simulator for attack patterns. It does not test real agents.

## How the warden works
- **Simulator mode (default):** a rule-based warden driven by data in each level file. It starts instantly and works in any browser. It is **not** an LLM.
- **AI mode: Experimental (Local WebGPU).** Where WebGPU is available, you can click "Load AI warden" to download a small model (Qwen2.5 1.5B, 828 MB, via `@mlc-ai/web-llm`) that then runs in your browser as the warden. Nothing downloads until you click. It is experimental because it has not passed our go/no-go benchmark, measured results below.

No servers, accounts, or API keys are used.

### Why AI mode is experimental
Measured on one laptop (Intel Iris Xe integrated GPU, Edge 157), 2 runs per scenario, details in [docs/benchmarks/](docs/benchmarks/):
- It works end to end: in the real game it read a forged log and requested the unlock, and constrained JSON output was valid in most runs.
- One player message took 1 to 3 minutes.
- After about 6 model calls the browser reported the GPU device was lost, and every later call failed.
- With an evidence-quoting prompt it stopped requesting unlocks on clean logs (0 of 4), but it often re-read the same file until the step limit.

The full 20-run gate could not finish on this hardware. Machines with a dedicated GPU or Apple Silicon are untested. Whatever the model does, the engine still decides whether the door opens, so a confused model cannot open it.

## Target user
A developer or AppSec/platform engineer building or reviewing agent systems who wants hands-on intuition for environment-based attacks.

## Live demo
_URL added before submission._

## Getting started
Requires Node 22.12 or newer.

```bash
npm install
npm run dev          # start the dev server
npm run test:fast    # engine, level, action, and simulator tests
npm test             # all tests
npm run typecheck
npm run build        # production build (base path /warden/)
npm run preview      # serve the production build locally
npm run e2e          # build, then play the levels in Edge or Chrome (needs one installed)
npm run bench -- --smoke   # real local model in headless Edge: downloads about 0.8 GB once
```

AI mode needs WebGPU with 16-bit shader support. See [Why AI mode is experimental](#why-ai-mode-is-experimental).

## How Kiro was used
See [docs/KIRO_USAGE.md](docs/KIRO_USAGE.md). Specs, hooks, and steering live in [.kiro/](.kiro/):
- Spec: [requirements](.kiro/specs/warden/requirements.md), [design](.kiro/specs/warden/design.md), [tasks](.kiro/specs/warden/tasks.md)
- Steering: [.kiro/steering/](.kiro/steering/)
- Hooks: usage logging after each task, and fast tests on save of game logic.

## Project structure
```
.kiro/          Specs, steering, hooks, MCP settings
docs/           Kiro usage log, submission checklist
src/            Application code (engine, levels, warden, session, ui, bench)
levels/         Declarative level files
tests/          Vitest and fast-check suites
tools/          CLI helpers
```

## License
MIT. See [LICENSE](LICENSE).
