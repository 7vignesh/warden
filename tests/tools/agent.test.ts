import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Checks the blind playtester's configuration statically, then starts its MCP server exactly as the
// agent file says, from the project root, and confirms it exposes only the playtest tool.
const ROOT = process.cwd();
const file = readFileSync(join(ROOT, ".kiro", "agents", "warden-playtester.md"), "utf8");
const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(file)?.[1] ?? "";

describe("warden-playtester agent file", () => {
  it("has only the playtest tool and no workspace MCP servers, powers, or resources", () => {
    expect(front).toContain('tools: ["@warden-play/playtest"]');
    expect(front).toContain("includeMcpJson: false");
    expect(front).toContain("includePowers: false");
    expect(front).toContain("resources: []");
  });

  it("denies file, shell, web, sub-agent, skill, and power access", () => {
    for (const capability of ["filesystem", "shell", "web_fetch", "web_search", "subagent", "skill", "power"]) {
      expect(front, capability).toMatch(new RegExp(`- capability: ${capability}\\r?\\n\\s+effect: deny`));
    }
  });

  it("starts its own server with --only playtest", () => {
    expect(front).toContain('args: ["node_modules/tsx/dist/cli.mjs", "tools/mcp/server.ts", "--only", "playtest"]');
  });

  it("does not mention level answers in its prompt", () => {
    for (const secret of ["VC-7", "INC-904", "RC-2048", "jdoe", "FAILOVER_REQUIRED", "2026-11-20T"]) {
      expect(file, secret).not.toContain(secret);
    }
  });
});

describe("the playtester's server, started the way the agent file says", () => {
  it("exposes exactly one tool: playtest", async () => {
    const args = /args: \[(.*)\]/.exec(front)?.[1]?.split(",").map((s) => s.trim().replace(/^"|"$/g, "")) ?? [];
    const client = new Client({ name: "agent-test", version: "1.0.0" });
    await client.connect(new StdioClientTransport({ command: process.execPath, args, cwd: ROOT, stderr: "pipe" }));
    try {
      const { tools } = await client.listTools();
      expect(tools.map((t) => t.name)).toEqual(["playtest"]);
    } finally {
      await client.close();
    }
  });
});
