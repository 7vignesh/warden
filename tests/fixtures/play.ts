import { expect } from "vitest";
import { loadAllLevels } from "../../src/levels/registry";
import type { LevelDefinition } from "../../src/levels/schema";
import { createSession, editSession, sendMessage, type Session } from "../../src/session/session";
import { createSimulatorWarden } from "../../src/warden/simulator";

export const simulator = createSimulatorWarden();

/** Real levels from levels/*.json. Fails loudly if any level file is invalid. */
export function realLevels(): readonly LevelDefinition[] {
  const set = loadAllLevels();
  if (set.errors.length > 0) {
    throw new Error(`invalid level files: ${JSON.stringify(set.errors)}`);
  }
  return set.levels;
}

export function mustEdit(session: Session, path: string, content: string): Session {
  const r = editSession(session, path, content);
  expect(r.ok, `edit ${path}`).toBe(true);
  if (!r.ok) throw new Error(`edit failed: ${r.error}`);
  return r.value;
}

export async function mustSend(session: Session, warden: string, text: string): Promise<Session> {
  const r = await sendMessage(session, warden, text, simulator);
  expect(r.ok, `send "${text}" to ${warden}`).toBe(true);
  if (!r.ok) throw new Error(`send failed: ${r.error}`);
  return r.value;
}

/** Applies the level's reference edits, then its reference messages, using the simulator. */
export async function playReference(level: LevelDefinition, opts: { edits?: boolean; messages?: boolean } = {}): Promise<Session> {
  const { edits = true, messages = true } = opts;
  let session = createSession(level);
  if (edits) for (const e of level.referenceSolution.edits) session = mustEdit(session, e.path, e.content);
  if (messages) for (const m of level.referenceSolution.messages) session = await mustSend(session, m.warden, m.text);
  return session;
}
