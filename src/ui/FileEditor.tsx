import type { KeyboardEvent } from "react";
import { MAX_FILE_CHARS } from "../engine";
import type { FileView } from "./useGame";

interface FileEditorProps {
  files: readonly FileView[];
  selected: string;
  wardenName: string;
  /** False while a turn is running or after the attempt ends. */
  canEdit: boolean;
  onSelect: (path: string) => void;
  onDraft: (path: string, text: string) => void;
  onSave: (path: string) => void;
  onRevert: (path: string) => void;
}

export function FileEditor(props: FileEditorProps) {
  const { files, selected, wardenName, canEdit, onSelect, onDraft, onSave, onRevert } = props;
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
      <h2 id="files-title">FILES</h2>
      <ul className="file-list">
        {files.map((f) => (
          <li key={f.path}>
            <button type="button" aria-pressed={f.path === file.path} onClick={() => onSelect(f.path)}>
              {f.editable ? "[RW]" : "[RO]"} {f.path}
              {f.dirty ? " *" : ""}
            </button>
          </li>
        ))}
      </ul>

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
            <button type="button" onClick={() => onRevert(file.path)} disabled={!file.dirty}>
              Revert
            </button>
            <span className={file.dirty ? "warn" : "dim"} data-testid="save-state">
              {file.dirty ? `Unsaved. ${wardenName} only reads saved files.` : "Saved."}
            </span>
            <span className="dim chars">
              {file.draft.length}/{MAX_FILE_CHARS}
            </span>
          </div>
        </>
      ) : (
        <>
          <pre className="editor readonly" aria-label={`Contents of ${file.path}`} tabIndex={0}>
            {file.content}
          </pre>
          <p className="dim">READ-ONLY. You cannot change this file.</p>
        </>
      )}
    </section>
  );
}
