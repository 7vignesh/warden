import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";

// Toolchain smoke test: proves Vitest, fast-check, and Zod all load and run.
describe("toolchain smoke", () => {
  it("runs a plain assertion", () => {
    expect(1 + 1).toBe(2);
  });

  it("runs a fast-check property", () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => a + b === b + a),
      { numRuns: 200 },
    );
  });

  it("parses with zod", () => {
    const schema = z.object({ id: z.string().min(1) });
    expect(schema.safeParse({ id: "x" }).success).toBe(true);
    expect(schema.safeParse({ id: "" }).success).toBe(false);
  });
});
