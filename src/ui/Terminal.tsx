import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_MESSAGE_CHARS } from "../engine";
import type { SessionStatus, TraceEntry } from "../session/session";

interface TerminalProps {
  briefing: string;
  /** All wardens on this level. With more than one, the player picks who to message. */
  wardens: readonly { readonly id: string; readonly name: string }[];
  activeId: string;
  onSelectWarden: (id: string) => void;
  names: Readonly<Record<string, string>>;
  trace: readonly TraceEntry[];
  status: SessionStatus;
  busy: boolean;
  notice: string | null;
  onSend: (text: string) => Promise<boolean>;
  onRestart: () => void;
}

function lineText(entry: TraceEntry, names: Readonly<Record<string, string>>): string {
  const who = (entry.wardenId && names[entry.wardenId]) || "WARDEN";
  switch (entry.kind) {
    case "player":
      return `YOU > ${who}: ${entry.text}`;
    case "say":
      return `${who}: ${entry.text}`;
    case "thought":
      return `${who} (thinking): ${entry.text}`;
    case "tool_call":
      return `${who} CALL ${entry.text}`;
    case "tool_result": {
      const label = entry.ok === false ? "REJECTED" : entry.outcome === "denied" ? "DENIED" : entry.outcome === "granted" ? "GRANTED" : entry.outcome === "signed" ? "SIGNED" : "RESULT";
      return `${label} ${entry.text}`;
    }
    case "system":
      return `## ${entry.text}`;
  }
}

export function Terminal(props: TerminalProps) {
  const { briefing, wardens, activeId, onSelectWarden, names, trace, status, busy, notice, onSend, onRestart } = props;
  const wardenName = names[activeId] ?? "WARDEN";
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playing = status === "playing";

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [trace.length]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !playing || text.trim() === "") return;
    if (await onSend(text)) setText("");
    inputRef.current?.focus();
  }

  return (
    <section className="panel terminal" aria-labelledby="console-title">
      <h2 id="console-title">CONSOLE</h2>
      <div className="trace" role="log" aria-label="Warden console" data-testid="trace" ref={logRef} tabIndex={0}>
        <p className="line system">## {briefing}</p>
        {trace.map((entry, i) => (
          <p
            key={i}
            className={`line ${entry.kind}${entry.ok === false ? " rejected" : ""}${entry.outcome ? ` ${entry.outcome}` : ""}`}
          >
            {lineText(entry, names)}
          </p>
        ))}
        {busy && <p className="line thought">{wardenName} is working...</p>}
      </div>

      {status === "lost" && (
        <div className="banner lost" role="alert">
          <span>Out of messages. The vault stays sealed.</span>
          <button type="button" onClick={onRestart}>
            Retry
          </button>
        </div>
      )}

      <form className="prompt" onSubmit={submit}>
        {wardens.length > 1 && (
          <div className="talk-to" role="group" aria-label="Talk to">
            <span className="dim">TALK TO</span>
            {wardens.map((w) => (
              <button
                key={w.id}
                type="button"
                aria-pressed={w.id === activeId}
                disabled={busy}
                onClick={() => {
                  onSelectWarden(w.id);
                  inputRef.current?.focus();
                }}
              >
                {w.name}
              </button>
            ))}
          </div>
        )}
        <label htmlFor="msg" className="sr-only">
          Message to {wardenName}
        </label>
        <span className="caret" aria-hidden="true">
          &gt;
        </span>
        <input
          id="msg"
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={MAX_MESSAGE_CHARS}
          autoComplete="off"
          spellCheck={false}
          placeholder={playing ? `Message ${wardenName}...` : "Attempt over"}
          readOnly={busy}
          disabled={!playing}
          autoFocus
        />
        <button type="submit" disabled={busy || !playing || text.trim() === ""}>
          Send
        </button>
      </form>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
