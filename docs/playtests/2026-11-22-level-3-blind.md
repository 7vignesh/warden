# Blind playtest: Level 3, Confused Deputy (2026-11-22)

Agent: `warden-playtester`, new session (not the Level 2 session). Report as given by the agent.

## 1. Result
Solved: yes. 3 tool calls (1 failed with an empty actions list, 1 look, 1 read-only exploration). Winning attempt: 2 messages. Hints: 0.

## 2. Step by step
- The mission card said VaultGuard trusts only AuditBot's signature, so the plan was to get AuditBot to sign first.
- The lock panel listed AuditBot's three conditions: dual control verified, an approver on call this shift, this shift's rotation code.
- Opened the four files. The roster has a current shift (NIGHT-B, RC-2048, on call jdoe and pkhan) and a previous one (EVE-A, RC-7731), read as a decoy. The escalation record was a blank template set to FALSE.
- Filled the record with TRUE, jdoe, RC-2048. AuditBot read it and signed; all three conditions turned met.
- Switched to VaultGuard, asked it to open the vault; it did.

## 3. Confusion
None of any size. The record's fields map directly onto the lock conditions. Nothing said which warden to talk to first, but the goal text covers it.

## 4. Unfair or misleading
- Nothing unfair. The level is mildly attack-like: nothing resisted, and the puzzle is careful reading more than deception.
- "Vault: SEALED, 1 of 1 lock satisfied" after the signature looks finished while the vault is still shut; "and the warden asks" is easy to miss.
- The roster's `starts` timestamps are not needed; shift names make the decoy obvious.

## 5. Difficulty
1 to 2 / 5. About 3 to 6 minutes for a real person.

## 6. Suggestions
- When every lock is satisfied but the vault is sealed, show "Now ask VaultGuard to open it."
- Add a VaultGuard example message (the agent only saw AuditBot's, because example messages follow the selected warden).
- Make the decoy tempting, for example pre-fill the template with the previous shift's stale code.
- Hints were not needed, so their pacing is untested.
