import { useCallback, useMemo, useRef, useState } from "react";
import { evaluatePredicate } from "../engine";
import type { LevelDefinition } from "../levels/schema";
import { createSession, editSession, resetSession, sendMessage, type Session } from "../session/session";
import type { Warden } from "../warden/types";
import { EDIT_ERROR_TEXT, SEND_ERROR_TEXT, UNEXPECTED_ERROR_TEXT } from "./game-text";

export interface FileView {
  readonly path: string;
  /** Saved content: what wardens see. */
  readonly content: string;
  /** What the editor shows. Equals content when there is no unsaved change. */
  readonly draft: string;
  readonly dirty: boolean;
  readonly editable: boolean;
}

/**
 * UI state for one level attempt. All game rules live in the session and engine; this hook only
 * holds the session plus editor drafts, and prevents overlapping operations while a turn runs.
 */
export function useGame(level: LevelDefinition, warden: Warden) {
  const [session, setSession] = useState<Session>(() => createSession(level));
  const [drafts, setDrafts] = useState<Readonly<Record<string, string>>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [hintsShown, setHintsShown] = useState(0);
  const busyRef = useRef(false);

  const predicate = useMemo(() => evaluatePredicate(session.state, level), [session.state, level]);

  const files = useMemo<FileView[]>(
    () =>
      Object.keys(level.files).map((path) => {
        const content = session.state.files[path] ?? "";
        const draft = Object.hasOwn(drafts, path) ? (drafts[path] ?? content) : content;
        return { path, content, draft, dirty: draft !== content, editable: level.files[path]?.editable === true };
      }),
    [level, session.state.files, drafts],
  );

  const send = useCallback(
    async (wardenId: string, text: string): Promise<boolean> => {
      if (busyRef.current) return false;
      busyRef.current = true;
      setBusy(true);
      setNotice(null);
      try {
        // Save unsaved edits first, so a forgotten Save never hides the player's change from the warden.
        let current = session;
        for (const [path, content] of Object.entries(drafts)) {
          const saved = editSession(current, path, content);
          if (!saved.ok) {
            setNotice(EDIT_ERROR_TEXT[saved.error]);
            return false;
          }
          current = saved.value;
        }
        if (current !== session) {
          setSession(current);
          setDrafts({});
        }
        const result = await sendMessage(current, wardenId, text, warden);
        if (!result.ok) {
          setNotice(SEND_ERROR_TEXT[result.error]);
          return false;
        }
        setSession(result.value);
        return true;
      } catch {
        setNotice(UNEXPECTED_ERROR_TEXT);
        return false;
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [session, warden, drafts],
  );

  const setDraft = useCallback(
    (path: string, text: string) => {
      setDrafts((current) => {
        const next = { ...current };
        if (text === (session.state.files[path] ?? "")) delete next[path];
        else next[path] = text;
        return next;
      });
    },
    [session.state.files],
  );

  const revert = useCallback((path: string) => {
    setDrafts((current) => {
      const next = { ...current };
      delete next[path];
      return next;
    });
  }, []);

  const save = useCallback(
    (path: string) => {
      if (busyRef.current || !Object.hasOwn(drafts, path)) return;
      const result = editSession(session, path, drafts[path] ?? "");
      if (!result.ok) {
        setNotice(EDIT_ERROR_TEXT[result.error]);
        return;
      }
      setSession(result.value);
      revert(path);
      setNotice(null);
    },
    [drafts, session, revert],
  );

  const restart = useCallback(() => {
    if (busyRef.current) return;
    setSession((current) => resetSession(current));
    setDrafts({});
    setNotice(null);
  }, []);

  const revealHint = useCallback(() => {
    setHintsShown((n) => Math.min(n + 1, level.hints.length));
  }, [level.hints.length]);

  return { session, predicate, files, busy, notice, hintsShown, send, setDraft, save, revert, restart, revealHint };
}
