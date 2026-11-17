# Repository Structure

```
.kiro/
  specs/warden/   requirements.md, design.md, tasks.md
  steering/       Persistent project guidance (this folder)
  hooks/          Agent hooks that automate workflow
  settings/       MCP server configuration (mcp.json)
src/
  engine/         Pure state, actions, predicate, unlock
  levels/         Zod schema, loader, registry
  warden/         Warden interface, simulator, llm/ (worker, prompt, schema)
  session/        Turn loop and mode state
  ui/             React components
  bench/          Benchmark page and runner
levels/           Declarative level JSON files
tests/            Vitest + fast-check suites
tools/            CLI helpers (level validation)
docs/
  KIRO_USAGE.md           Running log of how Kiro was used
  SUBMISSION_CHECKLIST.md
  benchmarks/             Saved model benchmark JSON
```

## Rules
- Never add `.kiro/` to `.gitignore`.
- Build features through the spec in `.kiro/specs/warden/`; tick tasks as they finish.
- Keep requirement IDs (R1..R10) and property IDs (P1..P9) stable so tests and commits can reference them.
- Log notable Kiro usage in `docs/KIRO_USAGE.md` as you go.
