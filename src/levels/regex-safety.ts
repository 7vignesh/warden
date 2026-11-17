export const MAX_REGEX_LEN = 200;

/**
 * Conservative check for regexes that come from level files (R4.5).
 * This is a heuristic, not a proof of linear-time matching. It rejects the common
 * catastrophic shapes. Matching input is also capped by MAX_FILE_CHARS.
 */
export function isSafeRegex(source: string): boolean {
  if (source.length === 0 || source.length > MAX_REGEX_LEN) return false;
  if (/\\[1-9]/.test(source)) return false; // backreferences
  if (/\(\?<[=!]/.test(source)) return false; // lookbehind
  // A group containing a quantifier, itself followed by a quantifier: (a+)+  (a*)*  (a+){2,}
  if (/\([^()]*[+*][^()]*\)(?:[+*]|\{\d*,?\d*\})/.test(source)) return false;
  try {
    new RegExp(source, "m");
  } catch {
    return false;
  }
  return true;
}
