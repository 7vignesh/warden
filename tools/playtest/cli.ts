// Manual playtest: npx tsx tools/playtest/cli.ts <file.json>
// The file holds {"level": <number>, "actions": [...]}. See tools/playtest/driver.ts for the action list.
import { readFileSync } from "node:fs";
import { playtest } from "./driver";

const file = process.argv[2];
if (!file) {
  console.error('Usage: npx tsx tools/playtest/cli.ts <file.json>   with {"level": 2, "actions": [{"look": true}]}');
  process.exit(2);
}
console.log(await playtest(JSON.parse(readFileSync(file, "utf8"))));
