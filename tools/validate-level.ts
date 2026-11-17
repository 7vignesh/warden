// Placeholder CLI. Phase 1 replaces this with real Zod schema validation of every file in levels/.
import { readdirSync } from "node:fs";
import { join } from "node:path";

const dir = join(process.cwd(), "levels");
let files: string[] = [];
try {
  files = readdirSync(dir).filter((f) => f.endsWith(".json"));
} catch {
  // levels/ may not exist yet
}

console.log(`validate-level: found ${files.length} level file(s). Schema validation lands in Phase 1.`);
