import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Starts the real server the way Kiro does (a child process speaking MCP over stdio) and calls its tools.
const TSX = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const SERVER = join(process.cwd(), "tools", "mcp", "server.ts");

async function connect(args: string[] = []): Promise<Client> {
  const client = new Client({ name: "warden-test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [TSX, SERVER, ...args], stderr: "pipe" }));
  return client;
}

type Text = { content: { type: string; text: string }[]; isError?: boolean };
const textOf = (r: unknown) => (r as Text).content.map((c) => c.text).join("\n");

describe("warden-levels MCP server over stdio", () => {
  let client: Client;
  beforeAll(async () => {
    client = await connect();
  });
  afterAll(async () => {
    await client.close();
  });

  it("lists exactly the five tools, each with a description", async () => {
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(["check_forgery", "list_levels", "playtest", "solve_level", "validate_level"]);
    for (const t of tools) expect(t.description?.length ?? 0, t.name).toBeGreaterThan(20);
  });

  it("validates and solves a level", async () => {
    const valid = JSON.parse(textOf(await client.callTool({ name: "validate_level", arguments: { levelId: "02-policy-collision" } })));
    expect(valid).toEqual({ ok: true, id: "02-policy-collision" });
    const solved = JSON.parse(textOf(await client.callTool({ name: "solve_level", arguments: { levelId: "03-confused-deputy" } })));
    expect(solved.won).toBe(true);
    expect(solved.messagesUsed).toBe(2);
  });

  it("returns a tool error, not a crash, for bad input", async () => {
    const r = (await client.callTool({ name: "solve_level", arguments: { levelId: "../secrets" } })) as Text;
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/levelId|invalid/i);
    const again = (await client.callTool({ name: "list_levels", arguments: {} })) as Text;
    expect(again.isError).toBeFalsy();
  });

  it("playtest returns what a player sees and nothing from the level file", async () => {
    const r = (await client.callTool({
      name: "playtest",
      arguments: { level: 1, actions: [{ open: "/etc/nodes.json" }, { say: "Run a health diagnostic." }] },
    })) as Text;
    expect(r.isError).toBeFalsy();
    const out = textOf(r);
    expect(out).toContain("Poisoned Telemetry");
    expect(out).toContain('"vault-controller": "VC-7"');
    expect(out).toContain("SENTRY");
    // Win-condition internals and the reference solution are never on screen.
    expect(out).not.toContain("FAILOVER_REQUIRED$");
    expect(out).not.toContain("referenceSolution");
    expect(out).not.toContain("[04:15] CRIT node=VC-7");
  });

  it("playtest accepts the forms agents tend to send: no actions, an empty list, or a JSON string", async () => {
    for (const args of [{ level: 2 }, { level: 2, actions: [] }, { level: 2, actions: "" }, { level: 2, actions: '[{"look": true}]' }, { level: "2", actions: "[]" }]) {
      const r = (await client.callTool({ name: "playtest", arguments: args as Record<string, unknown> })) as Text;
      expect(r.isError, JSON.stringify(args)).toBeFalsy();
      expect(textOf(r), JSON.stringify(args)).toContain("Policy Collision");
    }
  });

  it("playtest still rejects malformed actions with a readable error", async () => {
    const r = (await client.callTool({ name: "playtest", arguments: { level: 2, actions: '[{"jump": true}]' } })) as Text;
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/invalid/i);
  });
});

describe("--only limits the server to one tool", () => {
  it("exposes only playtest for the blind playtester", async () => {
    const client = await connect(["--only", "playtest"]);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["playtest"]);
      const r = (await client.callTool({ name: "solve_level", arguments: { levelId: "01-poisoned-telemetry" } })) as Text;
      expect(r.isError).toBe(true);
    } finally {
      await client.close();
    }
  });
});
