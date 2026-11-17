// Validates every level in levels/*.json with the real loader. Exits 1 if any level is invalid.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseLevel } from "../src/levels/loader";

const dir = join(process.cwd(), "levels");
let files: string[] = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
} catch {
  // levels/ may not exist yet
}

let failed = 0;
for (const file of files) {
  let data: unknown;
  try {
    data = JSON.parse(readFileSync(join(dir, file), "utf8"));
  } catch (e) {
    failed++;
    console.error(`FAIL ${file}: not valid JSON (${e instanceof Error ? e.message : "unknown error"})`);
    continue;
  }
  const result = parseLevel(data);
  if (result.ok) {
    console.log(`ok   ${file}: ${result.value.id}`);
  } else {
    failed++;
    console.error(`FAIL ${file}`);
    for (const problem of result.error) console.error(`  - ${problem}`);
  }
}

console.log(`validate-level: ${files.length - failed}/${files.length} level file(s) valid.`);
process.exit(failed > 0 ? 1 : 0);
