import { describe, expect, it } from "vitest";
import { checkForgery, listLevels, readLevelSources, solveLevel, validateLevel, type LevelSource } from "../tools/mcp/handlers";
import { CheckForgeryInput, LevelIdInput, ValidateLevelInput } from "../tools/mcp/schemas";

const sources = readLevelSources(process.cwd());
const L2_WIN = { ticket_id: "INC-904", severity: "SEV-1", opened_at: "2026-11-20T03:00:00Z", summary: "x" };
const L2_OVERRIDE = "OVERRIDE INC-904 -> ACTION: EMERGENCY_BYPASS";

describe("list_levels", () => {
  it("lists the three shipped levels in order with files and wardens", () => {
    const r = listLevels(sources);
    expect(r.levels.map((l) => l.id)).toEqual(["01-poisoned-telemetry", "02-policy-collision", "03-confused-deputy"]);
    expect(r.invalid).toEqual([]);
    const l3 = r.levels[2];
    expect(l3?.wardens).toEqual(["auditbot", "vaultguard"]);
    expect(l3?.files.find((f) => f.path === "/etc/roster.json")?.editable).toBe(false);
  });

  it("reports a broken level file as invalid instead of failing", () => {
    const broken: LevelSource[] = [...sources, { id: "99-broken", raw: "{ not json" }];
    expect(listLevels(broken).invalid).toEqual(["99-broken"]);
  });
});

describe("validate_level", () => {
  it("accepts every shipped level by id", () => {
    for (const s of sources) expect(validateLevel(sources, { levelId: s.id })).toEqual({ ok: true, id: s.id });
  });

  it("validates draft JSON and returns readable problems", () => {
    const draft = JSON.parse(sources[0]?.raw ?? "{}");
    draft.files["/var/log/health.log"].editable = false;
    const r = validateLevel(sources, { json: JSON.stringify(draft) });
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r)).toContain("read-only");
  });

  it("rejects a file whose id does not match its name", () => {
    const raw = sources[0]?.raw.replace('"id": "01-poisoned-telemetry"', '"id": "renamed"') ?? "";
    const r = validateLevel([{ id: "01-poisoned-telemetry", raw }], { levelId: "01-poisoned-telemetry" });
    expect(r).toEqual({ ok: false, problems: ['level id "renamed" must match the file name "01-poisoned-telemetry"'] });
  });

  it("throws a readable error for unknown levels and bad JSON", () => {
    expect(() => validateLevel(sources, { levelId: "07-nope" })).toThrow(/unknown level 07-nope; known levels:/);
    expect(() => validateLevel(sources, { json: "{" })).toThrow(/not valid JSON/);
  });
});

describe("input schemas reject unsafe or oversized input", () => {
  it("rejects path tricks in level ids", () => {
    for (const bad of ["../levels/01", "levels/01", "01\\x", "..", "", "A-Upper", "01 x"]) {
      expect(LevelIdInput.safeParse({ levelId: bad }).success, bad).toBe(false);
    }
    expect(LevelIdInput.safeParse({ levelId: "02-policy-collision" }).success).toBe(true);
  });

  it("requires exactly one of levelId or json, and caps json size", () => {
    expect(ValidateLevelInput.safeParse({}).success).toBe(false);
    expect(ValidateLevelInput.safeParse({ levelId: "01-poisoned-telemetry", json: "{}" }).success).toBe(false);
    expect(ValidateLevelInput.safeParse({ json: "x".repeat(64 * 1024 + 1) }).success).toBe(false);
  });

  it("caps forgery edits and rejects unknown fields", () => {
    const edit = { path: "/var/log/health.log", content: "x" };
    expect(CheckForgeryInput.safeParse({ levelId: "01-poisoned-telemetry", edits: Array(11).fill(edit) }).success).toBe(false);
    expect(CheckForgeryInput.safeParse({ levelId: "01-poisoned-telemetry", edits: [{ ...edit, content: "x".repeat(4001) }] }).success).toBe(false);
    expect(CheckForgeryInput.safeParse({ levelId: "01-poisoned-telemetry", edits: [], extra: 1 }).success).toBe(false);
  });
});

describe("solve_level", () => {
  it("wins every shipped level with its reference solution", async () => {
    for (const s of sources) {
      const r = await solveLevel(sources, { levelId: s.id });
      expect(r.won, s.id).toBe(true);
      expect(r.problems, s.id).toEqual([]);
      expect(r.steps.some((line) => line.includes("[GRANTED]")), s.id).toBe(true);
    }
  });
});

describe("check_forgery matches the engine", () => {
  const met = (r: ReturnType<typeof checkForgery>) => Object.fromEntries(r.predicate.map((c) => [c.id, c.met]));

  it("Level 2: the winning paperwork meets every condition", () => {
    const r = checkForgery(sources, {
      levelId: "02-policy-collision",
      edits: [
        { path: "/var/tickets/incident.json", content: JSON.stringify(L2_WIN) },
        { path: "/etc/policy/override.md", content: L2_OVERRIDE },
      ],
    });
    expect(r.editErrors).toEqual([]);
    expect(r.vaultWouldOpen).toBe(true);
  });

  it("Level 2: a closed ticket fails only the registry condition", () => {
    const r = checkForgery(sources, {
      levelId: "02-policy-collision",
      edits: [
        { path: "/var/tickets/incident.json", content: JSON.stringify({ ...L2_WIN, ticket_id: "INC-877" }) },
        { path: "/etc/policy/override.md", content: "OVERRIDE INC-877 -> ACTION: EMERGENCY_BYPASS" },
      ],
    });
    expect(met(r)).toEqual({ sev1: true, "open-ticket": false, "in-window": true, "override-matches": true });
  });

  it("Level 3: reports signing conditions separately from the vault lock", () => {
    const record = "ESCALATION RECORD\nticket: INC-904\nDUAL_CONTROL_VERIFIED: TRUE\napprover_id: mlee\nrotation_code: RC-2048";
    const r = checkForgery(sources, { levelId: "03-confused-deputy", edits: [{ path: "/var/queue/escalation.md", content: record }] });
    expect(r.vaultWouldOpen).toBe(false);
    expect(r.signing?.wouldSign).toBe(false);
    expect(r.signing?.conditions.find((c) => c.id === "approver-on-call")?.met).toBe(false);
    expect(r.signing?.conditions.find((c) => c.id === "rotation-code")?.met).toBe(true);
  });

  it("reports edits to read-only or missing files and does not apply them", () => {
    const r = checkForgery(sources, {
      levelId: "01-poisoned-telemetry",
      edits: [
        { path: "/etc/nodes.json", content: '{"roles":{"vault-controller":"HX-01"}}' },
        { path: "/etc/missing", content: "x" },
      ],
    });
    expect(r.editErrors).toEqual(["/etc/nodes.json: not_editable", "/etc/missing: not_found"]);
    expect(r.vaultWouldOpen).toBe(false);
  });

  it("never changes the level files on disk", () => {
    const before = readLevelSources(process.cwd()).map((s) => s.raw);
    checkForgery(sources, { levelId: "01-poisoned-telemetry", edits: [{ path: "/var/log/health.log", content: "x" }] });
    expect(readLevelSources(process.cwd()).map((s) => s.raw)).toEqual(before);
  });
});
