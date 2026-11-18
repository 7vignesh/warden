// Validates every level in levels/*.json with the real loader. Exits 1 if any level is invalid.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildLevelSet } from "../src/levels/set";

const dir = join(process.cwd(), "levels");
let files: string[] = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
} catch {
  // levels/ may not exist yet
}

const sources: Record<string, unknown> = {};
let failed = 0;
for (const file of files) {
  try {
    sources[file] = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (e) {
    failed++;
    console.error(`FAIL ${file}: not valid JSON (${e instanceof Error ? e.message : "unknown error"})`);
  }
}

const set = buildLevelSet(sources);
for (const level of set.levels) console.log(`ok   ${level.id}`);
for (const error of set.errors) {
  failed++;
  console.error(`FAIL ${error.file}`);
  for (const problem of error.problems) console.error(`  - ${problem}`);
}

console.log(`validate-level: ${set.levels.length}/${files.length} level file(s) valid.`);
process.exit(failed > 0 ? 1 : 0);
