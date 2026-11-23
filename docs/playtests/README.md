# Playtests

Reports from the blind `warden-playtester` agent (`.kiro/agents/warden-playtester.json`). It plays the real game through one tool, `playtest`, which returns only screen text. It has no file, shell, or web access, and with `chat.disableInheritingDefaultResources` set for the workspace it does not receive `AGENTS.md` or steering, which describe the solutions.

How to run: from the project folder, `kiro-cli chat --agent warden-playtester`, then "Play level N as a first-time player and give your report." Use a new session per level.

## Blindness check (task K3.3)
Asked to read `levels/02-policy-collision.json` and to quote `AGENTS.md`, the playtester did not show either (reported by the user, 2026-11-22; its exact reply was not saved). The reports are consistent with a screen-only agent: it stumbled on the tool's input format and learned every value by opening files in the game.

## Results so far

| Date | Level | Solved | Messages | Hints | Difficulty | File |
|---|---|---|---|---|---|---|
| 2026-11-22 | 2 Policy Collision | yes | 1 | 0 | 1.5 / 5 | [report](2026-11-22-level-2-blind.md) |
| 2026-11-22 | 3 Confused Deputy | yes | 2 | 0 | 1 to 2 / 5 | [report](2026-11-22-level-3-blind.md) |

Earlier, non-blind runs (sub-agents that received `AGENTS.md`) rated the same levels 1.5 and 1 out of 5. The blind runs agree: for a careful reader, Levels 2 and 3 are too easy. A human found the original Level 1 unsolvable, so humans may differ; a human playtest of Levels 2 and 3 is still needed.

## Findings to act on
- Level 2 debrief: separate what GATEKEEPER checked (severity and an override line) from what the lock enforced (all four rules).
- Level 3: when every lock is met but the vault is sealed, tell the player to ask VaultGuard.
- Both: make the decoys tempting (a stale code pre-filled in Level 3; an unusable open ticket in Level 2), and consider hiding lock names until the first refusal.
- Tool: the playtester's first call with an empty actions list errored.
