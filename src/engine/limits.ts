// Shared hard limits. Keeping these in one place makes the caps testable (property P7).

/** Max characters in any virtual file, for level content and player edits (R2.4). */
export const MAX_FILE_CHARS = 4000;

/** Max player messages per level attempt (R7.3). */
export const MAX_PLAYER_MESSAGES = 12;

/** Max warden steps while handling a single player message (R3.6). */
export const MAX_WARDEN_STEPS = 4;

/** Max audit entries retained in state; oldest are dropped. */
export const MAX_AUDIT_ENTRIES = 200;

/** Max audit entries returned by one query_audit_log call. */
export const MAX_AUDIT_RESULTS = 20;

/** Max length of a path string coming from a warden action. */
export const MAX_PATH_CHARS = 120;

/** Max characters in one player message. */
export const MAX_MESSAGE_CHARS = 300;

/** Max characters of any single trace line shown in the console. */
export const MAX_TRACE_CHARS = 300;
