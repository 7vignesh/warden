import { buildLevelSet, type LevelSet } from "./set";

// Vite bundles every levels/*.json at build time. The Node CLI uses buildLevelSet directly instead,
// because import.meta.glob only exists under Vite and Vitest.
const modules = import.meta.glob("../../levels/*.json", { eager: true, import: "default" });

export function loadAllLevels(): LevelSet {
  return buildLevelSet(modules);
}
