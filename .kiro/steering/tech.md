# Tech Stack & Conventions

## Stack
- Language: TypeScript (strict) everywhere.
- UI: Vite + React, plain CSS for the retro CRT theme. State via hooks and a reducer.
- Validation: Zod (level schema, action schema).
- Local LLM: `@mlc-ai/web-llm` in a Web Worker, JSON-schema constrained output, `temperature: 0`.
- Tests: Vitest + fast-check.
- Hosting: static site on GitHub Pages. No backend, no database, no API keys.

## Conventions
- `src/engine` is pure: no DOM, no network, no randomness, no clock. Same input, same output.
- All warden output is untrusted. Validate with Zod before the engine acts on it.
- Level files are data. No code execution from level content; predicates are declarative; regexes are length-limited.
- Keep dependencies minimal; pin exact versions.
- Never commit secrets. Keep `.env.example` current (the app should need none).
- Small focused modules, meaningful commit messages.
- Property-based tests for engine invariants (see design.md section 11). The save hook runs `npm run test:fast` only. The model benchmark is manual.

## Hackathon rules to respect
- All code must be written during the submission period (Oct 30 to Dec 4, 2026).
- Do not copy in pre-existing project code. Frameworks, libraries, and starter templates are fine; disclose anything else.
- Repository must be public on GitHub at submission, with an OSS license and the `.kiro/` directory committed.
- Demo video under 3 minutes; demo URL must work without login.
