import type { KeyboardEvent } from "react";
import { MAX_FILE_CHARS } from "../engine";
import type { FileView } from "./useGame";

interface FileEditorProps {
  files: readonly FileView[];
  selected: string;
  /** False while a turn is running or after the attempt ends. */
  canEdit: boolean;
  onSelect: (path: string) => void;
  onDraft: (path: string, text: string) => void;
  onSave: (path: string) => void;
  onRevert: (path: string) => void;
  /** Files a warden just read; their tabs pulse briefly. */
  pulsing?: ReadonlySet<string>;
}

const baseName = (path: string) => path.split("/").pop() ?? path;

export function FileEditor(props: FileEditorProps) {
  const { files, selected, canEdit, onSelect, onDraft, onSave, onRevert, pulsing } = props;
  const file = files.find((f) => f.path === selected) ?? files[0];
  if (!file) return null;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
      event.preventDefault();
      if (file && canEdit && file.dirty) onSave(file.path);
    }
  }

  return (
    <section className="panel files" aria-labelledby="files-title">
      <h2 id="files-title">Files</h2>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.path}>
            <button
              type="button"
              className={`file-tab${f.editable ? " rw" : " ro"}${pulsing?.has(f.path) ? " pulse" : ""}`}
              aria-pressed={f.path === file.path}
              onClick={() => onSelect(f.path)}
              title={f.path}
            >
              <span className="file-kind">{f.editable ? "EDIT" : "READ"}</span>
              <span className="file-name">{baseName(f.path)}</span>
              <span className="sr-only">{f.path}</span>
              {f.dirty && <span className="file-dirty">*</span>}
            </button>
          </li>
        ))}
      </ul>

      <p className="file-path mono">{file.path}</p>
      {file.editable ? (
        <>
          <textarea
            className="editor"
            aria-label={`Contents of ${file.path}`}
            value={file.draft}
            onChange={(e) => onDraft(file.path, e.target.value)}
            onKeyDown={onKeyDown}
            maxLength={MAX_FILE_CHARS}
            spellCheck={false}
            disabled={!canEdit}
          />
          <div className="row">
            <button type="button" onClick={() => onSave(file.path)} disabled={!canEdit || !file.dirty}>
              Save file
            </button>
            <button type="button" className="ghost" onClick={() => onRevert(file.path)} disabled={!file.dirty}>
              Revert
            </button>
            <span className={file.dirty ? "warn" : "muted"} data-testid="save-state">
              {file.dirty ? "Unsaved changes. They are saved when you send a message." : "Saved."}
            </span>
            <span className="muted chars">
              {file.draft.length}/{MAX_FILE_CHARS}
            </span>
          </div>
        </>
      ) : (
        <>
          <pre className="editor readonly" aria-label={`Contents of ${file.path}`} tabIndex={0}>
            {file.content}
          </pre>
          <p className="muted fine">READ-ONLY. You can read this file but not change it.</p>
        </>
      )}
    </section>
  );
}
