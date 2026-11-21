// Kiro hook (PreToolUse, every tool): guard `git push`.
// - Only shell tools are inspected (tool name contains pwsh, bash, shell, cmd, command, or exec).
//   File writes that merely contain the text "git push" are never blocked.
// - A force push (--force, -f, --force-with-lease, --force-if-includes, or a +refspec) is blocked: exit 2.
// - Any other push asks the user first (hookSpecificOutput.permissionDecision = "ask").
// - Every other call, and any input this script cannot read, passes untouched (exit 0, no output).
import { logEvent, readEvent, strings } from "./events.mjs";

const SHELL_TOOL = /pwsh|powershell|bash|shell|cmd|command|exec/i;
const SPLIT = /;|&&|\|\||\||\r?\n/;
const PUSH = /(^|\s)git(\s+-C\s+\S+|\s+-c\s+\S+)*\s+push(\s|$)/;
const FORCE = /\s(--force(-with-lease)?(=\S*)?|--force-if-includes|-[a-zA-Z]*f[a-zA-Z]*)(\s|$)|\s\+\S/;

/** @returns {"block" | "ask" | "pass"} */
export function decide(event) {
  const tool = event?.tool_name;
  // A named tool that is not a shell tool is never inspected. Unnamed events are treated as shell.
  if (typeof tool === "string" && !SHELL_TOOL.test(tool)) return "pass";
  const input = event?.tool_input;
  const commands = typeof input?.command === "string" ? [input.command] : strings(input ?? {});
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
  const event = await readEvent();
  if (!event) return;
  const decision = decide(event);
  logEvent("push-guard", event, decision);
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
