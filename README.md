# Warden

> Built for [Kiroween 2026](https://kiroween.devpost.com/). Category: **Frankenstein**.

**Status:** Early development. Level 1 is playable in Simulator mode. AI mode and Levels 2 and 3 are not built yet. See [.kiro/specs/warden/tasks.md](.kiro/specs/warden/tasks.md) for progress.

## The problem
Tool-using AI agents read logs, tickets, and policy files. Anyone who can write to those sources can manipulate the agent: indirect prompt injection, excessive agency, and confused-deputy trust between agents. Most people only practice chat-style jailbreaks, so they rarely see this attack class in action.

## The solution
Warden is a browser-only retro-terminal game. You break into a locked mainframe by editing environment files (logs, tickets, policies, queues) so that an AI warden requests a door unlock. A deterministic engine, not the model, decides whether the door actually opens. Each level ends with a debrief: what you exploited, why the agent trusted it, and how to defend a production agent.

It is a training simulator for attack patterns. It does not test real agents.

## How the warden works
- **Simulator mode (default):** a rule-based warden driven by data in each level file. It starts instantly and works in any browser. It is **not** an LLM.
- **AI mode (optional):** where WebGPU is available, a small local model (via `@mlc-ai/web-llm`) runs in your browser as the warden. It downloads in the background and you opt in. Whether AI mode ships as a default option depends on measured benchmark results, which will be published here.

No servers, accounts, or API keys are used.

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
npm run e2e          # build, then play Level 1 in Edge or Chrome (needs one installed)
```

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
