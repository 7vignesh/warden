import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// R7.7: text colors in the theme must meet WCAG AA (4.5:1) on both backgrounds,
// and the border color must meet 3:1 for UI component boundaries (WCAG 1.4.11).

const css = readFileSync(join(process.cwd(), "src/ui/theme.css"), "utf8");
const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
const vars: Record<string, string> = {};
for (const m of root.matchAll(/--([a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
  if (m[1] && m[2]) vars[m[1]] = m[2];
}

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = ["fg", "dim", "amber", "red", "cyan"];
const BACKGROUNDS = ["bg", "panel"];

describe("theme contrast", () => {
  it("parses every expected color from :root", () => {
    for (const name of [...TEXT, ...BACKGROUNDS, "border"]) expect(vars[name], name).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("matches known reference values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
  });

  for (const text of TEXT) {
    for (const bg of BACKGROUNDS) {
      it(`${text} on ${bg} is at least 4.5:1`, () => {
        expect(contrast(vars[text]!, vars[bg]!)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }

  for (const bg of BACKGROUNDS) {
    it(`border on ${bg} is at least 3:1`, () => {
      expect(contrast(vars["border"]!, vars[bg]!)).toBeGreaterThanOrEqual(3);
    });
  }
});
