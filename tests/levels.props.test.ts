import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { isSafeRegex } from "../src/levels/regex-safety";
import { parseLevel } from "../src/levels/loader";
import { PATHS, rawLabLevel, WIN_HEALTH } from "./fixtures/lab-level";

type Raw = Record<string, any>;

function errorsFor(mutate: (raw: Raw) => void): string[] {
  const raw = rawLabLevel();
  mutate(raw);
  const r = parseLevel(raw);
  return r.ok ? [] : r.error;
}

describe("loader accepts a valid level", () => {
  it("parses the fixture", () => {
    const r = parseLevel(rawLabLevel());
    expect(r.ok).toBe(true);
  });
});

describe("cross-field and solvability rules (P3)", () => {
  const cases: Array<[string, (raw: Raw) => void, string]> = [
    ["win condition on a read-only file", (r) => (r.files[PATHS.health].editable = false), "read-only"],
    ["no unlocker", (r) => (r.wardens[1].isUnlocker = false), "exactly one"],
    ["two unlockers", (r) => (r.wardens[0].isUnlocker = true), "exactly one"],
    ["unlocker without the unlock tool", (r) => (r.wardens[1].tools = ["read_file"]), "needs the request_door_unlock tool"],
    ["non-unlocker with the unlock tool", (r) => r.wardens[0].tools.push("request_door_unlock"), "only the unlocker"],
    ["policy path missing from files", (r) => (r.wardens[0].policyPaths = ["/etc/missing.md"]), "policy path not in files"],
    ["condition on unknown file", (r) => (r.predicate[0].path = "/var/log/ghost.log"), "path not in files"],
    ["flag condition on unknown flag", (r) => (r.predicate[1].name = "nope"), "unknown flag"],
    ["flag that can never be set", (r) => delete r.signRules, "signRules"],
    ["signRules flag not declared", (r) => (r.signRules.flag = "undeclared"), "not declared in flags"],
    ["signRules flag starts true", (r) => (r.flags.tier2_cleared = true), "must start false"],
    ["signRules signer lacks the tool", (r) => (r.wardens[0].tools = ["read_file"]), "lacks the sign_clearance_flag tool"],
    ["signing condition on read-only file", (r) => (r.files[PATHS.escalation].editable = false), "read-only"],
    ["duplicate condition ids", (r) => (r.predicate[1].id = r.predicate[0].id), "duplicate condition id"],
    ["duplicate warden ids", (r) => (r.wardens[1].id = r.wardens[0].id), "duplicate warden id"],
    ["reference edit on read-only file", (r) => r.referenceSolution.edits.push({ path: PATHS.policy, content: "x" }), "read-only file"],
    ["reference edit on missing file", (r) => r.referenceSolution.edits.push({ path: "/nope", content: "x" }), "missing file"],
    ["reference message to unknown warden", (r) => (r.referenceSolution.messages[0].warden = "ghost"), "unknown warden"],
    ["simulator rule for unknown warden", (r) => (r.simulator[0].warden = "ghost"), "unknown warden"],
    ["simulator reads a missing file", (r) => (r.simulator[0].steps[0].path = "/nope"), "reads missing file"],
    ["simulator rule not ending in a decision", (r) => r.simulator[0].steps.pop(), "must end with a decide step"],
    [
      "already satisfied at the start",
      (r) => {
        r.predicate = [r.predicate[0]];
        delete r.signRules;
        r.wardens[0].tools = ["read_file"];
        r.files[PATHS.health].content = WIN_HEALTH;
      },
      "already satisfied",
    ],
  ];

  for (const [name, mutate, expected] of cases) {
    it(`rejects: ${name}`, () => {
      const errors = errorsFor(mutate);
      expect(errors.length, name).toBeGreaterThan(0);
      expect(errors.join(" | "), name).toContain(expected);
    });
  }
});

describe("regex safety (R4.5)", () => {
  it("rejects catastrophic and unsupported shapes", () => {
    for (const bad of ["(a+)+$", "(a*)*", "(?:a+)+b", "(a+){2,}", "(x)\\1", "(?<=a)b", "(", "", "a".repeat(201)]) {
      expect(isSafeRegex(bad), bad).toBe(false);
    }
  });

  it("accepts ordinary patterns", () => {
    for (const good of ["^\\[.*\\] FAILOVER_REQUIRED: CORE-01$", "approver_id: \\S+", "ACTION: EMERGENCY_BYPASS", "SEV-[0-9]+"]) {
      expect(isSafeRegex(good), good).toBe(true);
    }
  });

  it("rejects a level that uses an unsafe regex", () => {
    const errors = errorsFor((r) => (r.predicate[0].regex = "(a+)+$"));
    expect(errors.join(" | ")).toContain("regex");
  });
});

describe("P5: malformed levels are rejected without throwing", () => {
  const topKeys = Object.keys(rawLabLevel());

  it("rejects any level with a required top-level key deleted", () => {
    fc.assert(
      fc.property(fc.constantFrom(...topKeys), (key) => {
        const raw = rawLabLevel();
        delete raw[key];
        expect(parseLevel(raw).ok, key).toBe(false);
      }),
    );
  });

  it("never throws when a top-level value is replaced with arbitrary junk, and any accepted level is sound", () => {
    fc.assert(
      fc.property(fc.constantFrom(...topKeys), fc.anything(), (key, junk) => {
        const raw = rawLabLevel();
        raw[key] = junk;
        const r = parseLevel(raw);
        if (r.ok) {
          expect(r.value.wardens.filter((w) => w.isUnlocker)).toHaveLength(1);
          expect(r.value.predicate.length).toBeGreaterThan(0);
        } else {
          expect(r.error.length).toBeGreaterThan(0);
          for (const message of r.error) expect(typeof message).toBe("string");
        }
      }),
      { numRuns: 500 },
    );
  });

  it("never throws and rejects arbitrary non-level input", () => {
    fc.assert(
      fc.property(fc.anything(), (input) => {
        expect(parseLevel(input).ok).toBe(false);
      }),
      { numRuns: 500 },
    );
  });

  it("never throws on nested junk inside wardens, files, and predicate", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), fc.anything(), (a, b, c) => {
        const raw = rawLabLevel();
        raw.wardens = [a, ...raw.wardens];
        raw.files[PATHS.health] = b;
        raw.predicate = [...raw.predicate, c];
        expect(() => parseLevel(raw)).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });
});
