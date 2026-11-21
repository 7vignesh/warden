// warden-levels: a local stdio MCP server that lets Kiro inspect, validate, solve, and playtest Warden levels.
// Run: npx tsx tools/mcp/server.ts            (all tools)
//      npx tsx tools/mcp/server.ts --only playtest   (one tool; used by the blind playtester agent)
// stdout carries MCP protocol messages only. Never print to stdout here.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { playtest, PlaytestInput, ROOT } from "../playtest/driver";
import { checkForgery, listLevels, readLevelSources, solveLevel, ToolError, validateLevel } from "./handlers";
import { CheckForgeryInput, CheckForgeryShape, LevelIdInput, LevelIdShape, ValidateLevelInput, ValidateLevelShape } from "./schemas";

export const TOOL_NAMES = ["list_levels", "validate_level", "solve_level", "check_forgery", "playtest"] as const;
type ToolName = (typeof TOOL_NAMES)[number];

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

const text = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value, null, 2) }],
});

/** Runs a handler and turns any failure into a readable tool error, never a stack trace. */
async function guarded(fn: () => unknown | Promise<unknown>): Promise<ToolResult> {
  try {
    return text(await fn());
  } catch (e) {
    const message =
      e instanceof z.ZodError
        ? `invalid input: ${e.issues.map((i) => `${i.path.join(".") || "(input)"}: ${i.message}`).join("; ")}`
        : e instanceof ToolError
          ? e.message
          : `internal error: ${e instanceof Error ? e.message.split("\n")[0] : String(e)}`;
    return { ...text(message), isError: true };
  }
}

export function createServer(only?: ToolName): McpServer {
  const server = new McpServer({ name: "warden-levels", version: "1.0.0" });
  const want = (name: ToolName) => only === undefined || only === name;
  const sources = () => readLevelSources(ROOT);

  if (want("list_levels")) {
    server.registerTool(
      "list_levels",
      { description: "List the Warden levels: id, order, title, OWASP tag, files (editable or not), and wardens." },
      () => guarded(() => listLevels(sources())),
    );
  }

  if (want("validate_level")) {
    server.registerTool(
      "validate_level",
      {
        description:
          "Validate one level with the game's real loader, including solvability rules. Pass levelId for a file in levels/, or json to check a draft without saving it.",
        inputSchema: ValidateLevelShape,
      },
      (args) => guarded(() => validateLevel(sources(), ValidateLevelInput.parse(args))),
    );
  }

  if (want("solve_level")) {
    server.registerTool(
      "solve_level",
      {
        description:
          "Play a level's reference solution through the rule-based simulator and the real session code. Reports whether it wins, messages used, and the conversation.",
        inputSchema: LevelIdShape,
      },
      (args) => guarded(() => solveLevel(sources(), LevelIdInput.parse(args))),
    );
  }

  if (want("check_forgery")) {
    server.registerTool(
      "check_forgery",
      {
        description:
          "Apply file edits to a fresh copy of a level and report each vault condition (and signing condition) as met or not. Saves nothing.",
        inputSchema: CheckForgeryShape,
      },
      (args) => guarded(() => checkForgery(sources(), CheckForgeryInput.parse(args))),
    );
  }

  if (want("playtest")) {
    server.registerTool(
      "playtest",
      {
        description: [
          "Play a Warden level in the real game, as a player, and get back only what is on screen.",
          "Each call starts a fresh game and runs all actions in order. Up to 50 actions; takes about 5 to 20 seconds.",
          'Actions: {"open": "/path"} show a file; {"write": "/path", "content": "..."} replace an editable file (saved when you next send);',
          '{"talk": "Name"} choose a warden; {"say": "text"} send a message (12 per attempt); {"hint": true} reveal the next hint; {"look": true} show the screen.',
        ].join(" "),
        inputSchema: PlaytestInput.shape,
      },
      (args) => guarded(() => playtest(PlaytestInput.parse(args))),
    );
  }

  return server;
}

function parseOnly(argv: readonly string[]): ToolName | undefined {
  const i = argv.indexOf("--only");
  if (i < 0) return undefined;
  const name = argv[i + 1];
  if (!name || !(TOOL_NAMES as readonly string[]).includes(name)) {
    process.stderr.write(`--only needs one of: ${TOOL_NAMES.join(", ")}\n`);
    process.exit(2);
  }
  return name as ToolName;
}

const isMain = process.argv[1] !== undefined && /[\\/]tools[\\/]mcp[\\/]server\.ts$/.test(process.argv[1]);
if (isMain) {
  const server = createServer(parseOnly(process.argv.slice(2)));
  await server.connect(new StdioServerTransport());
  process.stderr.write("warden-levels MCP server running on stdio\n");
}
