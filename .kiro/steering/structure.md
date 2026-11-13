# Repository Structure

```
.kiro/
  specs/       One folder per feature: requirements.md, design.md, tasks.md
  steering/    Persistent project guidance (this folder)
  hooks/       Agent hooks that automate workflow
  settings/    MCP server configuration (mcp.json)
docs/
  KIRO_USAGE.md          Running log of how Kiro was used (feeds the submission write-up)
  SUBMISSION_CHECKLIST.md
src/           Application code
```

## Rules
- Never add `.kiro/` to `.gitignore`.
- Build features through specs (`.kiro/specs/<feature>/`) so the process is visible to judges.
- Log notable Kiro usage in `docs/KIRO_USAGE.md` as you go.
