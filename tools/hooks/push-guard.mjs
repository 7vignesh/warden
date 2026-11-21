// Kiro hook (PreToolUse on shell tools): guard `git push`.
// - A force push (--force, -f, --force-with-lease, or a +refspec) is blocked: exit 2, reason on stderr.
// - Any other push asks the user first (hookSpecificOutput.permissionDecision = "ask").
// - Every other command, and any input this script cannot read, passes untouched (exit 0, no output),
//   so the guard can never block normal work by accident.
const SPLIT = /;|&&|\|\||\||\r?\n/;
const PUSH = /(^|\s)git(\s+-C\s+\S+|\s+-c\s+\S+)*\s+push(\s|$)/;
const FORCE = /\s(--force(-with-lease)?(=\S*)?|--force-if-includes|-[a-zA-Z]*f[a-zA-Z]*)(\s|$)|\s\+\S/;

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) for (const v of value) strings(v, out);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

/** @returns {"block" | "ask" | "pass"} */
export function decide(event) {
  const commands = strings(event?.tool_input ?? {});
  let decision = "pass";
  for (const command of commands) {
    for (const part of command.split(SPLIT)) {
      const p = ` ${part.trim()} `;
      if (!PUSH.test(p)) continue;
      const afterPush = p.slice(p.search(/\spush(\s|$)/));
      if (FORCE.test(afterPush)) return "block";
      decision = "ask";
    }
  }
  return decision;
}

async function main() {
  let raw = "";
  for await (const chunk of process.stdin) raw += chunk;
  let event;
  try {
    event = JSON.parse(raw);
  } catch {
    return;
  }
  const decision = decide(event);
  if (decision === "block") {
    process.stderr.write("push-guard: force pushes are blocked in this project. Push normally, or ask the user to do it by hand.\n");
    process.exit(2);
  }
  if (decision === "ask") {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PreToolUse",
          permissionDecision: "ask",
          permissionDecisionReason: "push-guard: this pushes commits to GitHub. Confirm before it runs.",
        },
      }),
    );
  }
}

const isMain = process.argv[1] && /push-guard\.mjs$/.test(process.argv[1]);
if (isMain) await main();
