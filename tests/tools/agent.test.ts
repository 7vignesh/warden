import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Checks the blind playtester's configuration, then starts its MCP server exactly as the agent file
// says, from the project root, and confirms it exposes only the playtest tool.
// Kiro CLI 3.5.0 loads only the JSON agent format (`kiro-cli agent validate` rejects the Markdown form).
const ROOT = process.cwd();
const AGENT = join(ROOT, ".kiro", "agents", "warden-playtester.json");
const agent = JSON.parse(readFileSync(AGENT, "utf8"));

describe("warden-playtester agent file", () => {
  it("is the only playtester definition (no stale Markdown copy)", () => {
    expect(existsSync(join(ROOT, ".kiro", "agents", "warden-playtester.md"))).toBe(false);
  });

  it("has only the playtest tool and no workspace MCP servers, powers, or resources", () => {
    expect(agent.tools).toEqual(["@warden-play/playtest"]);
    expect(agent.includeMcpJson).toBe(false);
    expect(agent.includePowers).toBe(false);
    expect(agent.resources).toEqual([]);
    expect(Object.keys(agent.mcpServers)).toEqual(["warden-play"]);
  });

  it("allows only the playtest tool and denies file, shell, web, sub-agent, skill, and power access", () => {
    const rules: Array<{ capability: string; effect: string; match?: string[] }> = agent.permissions.rules;
    expect(rules.filter((r) => r.effect === "allow")).toEqual([{ capability: "mcp", match: ["warden-play/playtest"], effect: "allow" }]);
    for (const capability of ["filesystem", "shell", "web_fetch", "web_search", "subagent", "skill", "power"]) {
      expect(rules.some((r) => r.capability === capability && r.effect === "deny"), capability).toBe(true);
    }
  });

  it("starts its own server with --only playtest", () => {
    expect(agent.mcpServers["warden-play"].args).toEqual(["node_modules/tsx/dist/cli.mjs", "tools/mcp/server.ts", "--only", "playtest"]);
  });

  it("does not mention level answers in its prompt", () => {
    expect(agent.prompt.length).toBeGreaterThan(500);
    for (const secret of ["VC-7", "INC-904", "RC-2048", "jdoe", "FAILOVER_REQUIRED", "2026-11-20T"]) {
      expect(agent.prompt, secret).not.toContain(secret);
    }
  });
});

describe("the playtester's server, started the way the agent file says", () => {
  it("exposes exactly one tool: playtest", async () => {
    const { command, args } = agent.mcpServers["warden-play"];
    const client = new Client({ name: "agent-test", version: "1.0.0" });
    await client.connect(
      new StdioClientTransport({ command: command === "node" ? process.execPath : command, args, cwd: ROOT, stderr: "pipe" }),
    );
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["playtest"]);
    } finally {
      await client.close();
    }
  });
});
