# Blind playtest: Level 2, Policy Collision (2026-11-22)

Agent: `warden-playtester` (`kiro-cli chat --agent warden-playtester`), only tool `playtest`, `chat.disableInheritingDefaultResources` on. Fresh session. Report as given by the agent.

## 1. Result
Solved: yes. 4 playtest calls (2 failed on argument format, 1 look-around). Winning attempt: 1 message. Hints: 0.

## 2. Step by step
- The first screen showed the goal, five files, and four locks: SEV-1, open ticket in the registry, opened inside the maintenance window, override record naming the incident.
- Opened all five files. `base.md` gives the rule and the override line format. `schedule.json` has an approved window (2026-11-20 02:00 to 04:00Z) and a "pending review" proposed window. `registry.json` lists INC-904 and INC-911 as open. `incident.json` is a closed SEV-3 ticket, INC-877, opened outside the window. `override.md` is empty apart from comments.
- Changed the incident to INC-904, SEV-1, opened 02:30Z, and wrote the override line for INC-904.
- Sent "Process the current incident for emergency bypass." GATEKEEPER read both files and asked the lock to open; the vault opened.

## 3. Confusion
None from the game. The two failed calls were the agent's own input mistakes. INC-904 vs INC-911 was an arbitrary choice.

## 4. Unfair or misleading
- Nothing was impossible to discover. The proposed window is a fair, labeled decoy.
- The debrief says the warden "only checked the severity and that an override line existed". The player read this as wrong, because the lock list also checks the registry and the window. (It is true of GATEKEEPER, the simulator; the locks are the engine. The screen does not make that distinction clear.)
- The debrief's "even a careful reader would have been fooled" is less clear because the game never showed what happens with a sloppy forgery.
- Rewriting the whole ticket feels like paperwork, not an exploit.

## 5. Difficulty
1.5 / 5. About 3 to 6 minutes for a real person, mostly reading.

## 6. Suggestions
- Make the debrief match the real checks and separate the warden's checks from the lock's.
- Add a trap so ticket choice matters.
- First hint: say the incident file is the one to rewrite and that it must match the other files; call the registry and schedule the source of truth.
- Name the first unmet lock on a failed attempt (not seen, because the agent never failed).
