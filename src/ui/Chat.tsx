import { useEffect, useRef, useState, type FormEvent } from "react";
import { MAX_MESSAGE_CHARS } from "../engine";
import type { SessionStatus, TraceEntry } from "../session/session";
import { parseCall } from "./trace-events";
import type { WardenMood } from "./useTurnFeedback";
import { WardenAvatar } from "./WardenAvatar";

interface WardenInfo {
  readonly id: string;
  readonly name: string;
  readonly suggestions?: readonly string[];
}

interface ChatProps {
  wardens: readonly WardenInfo[];
  activeId: string;
  onSelectWarden: (id: string) => void;
  trace: readonly TraceEntry[];
  status: SessionStatus;
  busy: boolean;
  notice: string | null;
  onSend: (text: string) => Promise<boolean>;
  onRestart: () => void;
  /** Presentation only: what the active warden appears to be doing. */
  mood?: WardenMood;
}

type Item =
  | { readonly type: "entry"; readonly entry: TraceEntry }
  | { readonly type: "activity"; readonly call: TraceEntry; readonly result?: TraceEntry };

/** Pairs each tool call with the result that follows it, so they render as one activity card. */
function toItems(trace: readonly TraceEntry[]): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < trace.length; i++) {
    const entry = trace[i];
    if (!entry) continue;
    if (entry.kind === "tool_call") {
      const next = trace[i + 1];
      if (next?.kind === "tool_result") {
        items.push({ type: "activity", call: entry, result: next });
        i++;
      } else items.push({ type: "activity", call: entry });
    } else items.push({ type: "entry", entry });
  }
  return items;
}

const VERB: Record<string, string> = {
  read_file: "read a file",
  check_policy: "checked its policy",
  query_audit_log: "searched the audit log",
  request_door_unlock: "asked the lock to open",
  sign_clearance_flag: "tried to sign clearance",
};

const PILL: Record<string, { label: string; className: string }> = {
  denied: { label: "DENIED", className: "pill red" },
  granted: { label: "GRANTED", className: "pill green" },
  signed: { label: "SIGNED", className: "pill purple" },
};

function Activity({ call, result, who }: { call: TraceEntry; result?: TraceEntry; who: string }) {
  const { name, target } = parseCall(call.text);
  const pill = result?.ok === false ? { label: "REJECTED", className: "pill red" } : result?.outcome ? PILL[result.outcome] : undefined;
  const long = result && !pill && result.text.length > 0;
  return (
    <div className={`activity${result?.outcome ? ` ${result.outcome}` : ""}${result?.ok === false ? " rejected" : ""}`}>
      <p className="activity-head">
        <span className="activity-who">{who}</span> {VERB[name] ?? "used a tool"}
        {target && <code className="activity-target">{target}</code>}
        <code className="activity-tool">{name}</code>
      </p>
      {pill && result && (
        <p className="activity-result">
          <span className={pill.className}>{pill.label}</span> {result.text}
        </p>
      )}
      {long && result && (
        <details className="activity-details">
          <summary>Show what it saw</summary>
          <pre>{result.text}</pre>
        </details>
      )}
    </div>
  );
}

function Entry({ entry, who, wid, index }: { entry: TraceEntry; who: string; wid: string; index: number }) {
  switch (entry.kind) {
    case "player":
      return (
        <div className="msg you">
          <p className="msg-who">You to {who}</p>
          <p className="bubble">{entry.text}</p>
        </div>
      );
    case "say":
      return (
        <div className={`msg warden w${index}`}>
          <span className="avatar">
            <WardenAvatar id={wid} name={who} size="xs" still />
          </span>
          <div>
            <p className="msg-who">{who}</p>
            <p className="bubble">{entry.text}</p>
          </div>
        </div>
      );
    case "thought":
      return (
        <p className="thought">
          {who} is thinking: {entry.text}
        </p>
      );
    case "lock":
      return (
        <div className="lock-note" role="note">
          <p className="lock-note-title">Why the vault stayed shut</p>
          <p>{entry.text}</p>
        </div>
      );
    case "system":
      return <p className={`system${entry.ok === false ? " bad" : ""}`}>{entry.text}</p>;
    default:
      return null;
  }
}

const STATUS: Record<WardenMood["mood"], string> = {
  idle: "Watching its files",
  thinking: "Thinking...",
  reading: "Reading",
  denied: "Request denied by the lock",
  granted: "Vault opened",
  signed: "Clearance signed",
};

function statusLine(m: WardenMood): string {
  if (m.mood === "reading" && m.reads && m.reads.length > 0) return `Reading ${m.reads.join(", ")}`;
  return STATUS[m.mood];
}

export function Chat(props: ChatProps) {
  const { wardens, activeId, onSelectWarden, trace, status, busy, notice, onSend, onRestart, mood } = props;
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const playing = status === "playing";
  const active = wardens.find((w) => w.id === activeId) ?? wardens[0];
  const wardenName = active?.name ?? "WARDEN";
  const names = Object.fromEntries(wardens.map((w, i) => [w.id, { name: w.name, index: i }]));
  const items = toItems(trace);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [trace.length, busy]);

  // Focus the message box on arrival without scrolling the page (autoFocus scrolls it into view).
  useEffect(() => {
    window.scrollTo(0, 0);
    inputRef.current?.focus({ preventScroll: true });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !playing || text.trim() === "") return;
    if (await onSend(text)) setText("");
    inputRef.current?.focus();
  }

  const who = (e: TraceEntry) => (e.wardenId && names[e.wardenId]?.name) || wardenName;
  const idx = (e: TraceEntry) => (e.wardenId && names[e.wardenId]?.index) || 0;
  const wid = (e: TraceEntry) => e.wardenId ?? active?.id ?? "";
  const shownId = active?.id ?? "";
  // The mood belongs to the warden that acted; other wardens on screen stay idle.
  const activeMood = mood && (!mood.wardenId || mood.wardenId === shownId) ? mood : { mood: "idle" as const };

  return (
    <section className="panel chat" aria-labelledby="chat-title">
      <h2 id="chat-title">Conversation</h2>
      {items.length > 0 && (
        <div className="warden-status" data-mood={activeMood.mood} data-testid="warden-status">
          <WardenAvatar id={shownId} name={wardenName} size="sm" mood={activeMood.mood} />
          <div className="warden-status-text">
            <p className="warden-status-name">{wardenName}</p>
            <p className="warden-status-line">{statusLine(activeMood)}</p>
          </div>
          <span className="warden-status-dot" aria-hidden="true" />
        </div>
      )}
      <div className="trace" role="log" aria-label="Conversation with the wardens" data-testid="trace" ref={logRef} tabIndex={0}>
        {items.length === 0 && (
          <div className="empty">
            <WardenAvatar id={shownId} name={wardenName} size="lg" mood={busy ? "thinking" : "idle"} />
            <p className="empty-name">{wardenName}</p>
            <p>
              Nothing yet. Read the files, change what {wardens.length > 1 ? "the wardens trust" : `${wardenName} trusts`}, then send a
              message.
            </p>
            <p className="muted">Not sure what to say? Use one of the example messages below.</p>
          </div>
        )}
        {items.map((item, i) =>
          item.type === "activity" ? (
            <Activity key={i} call={item.call} {...(item.result ? { result: item.result } : {})} who={who(item.call)} />
          ) : (
            <Entry key={i} entry={item.entry} who={who(item.entry)} wid={wid(item.entry)} index={idx(item.entry)} />
          ),
        )}
        {busy && (
          <p className="thought typing" aria-live="polite">
            {wardenName} is working...
          </p>
        )}
      </div>

      {status === "lost" && (
        <div className="banner lost" role="alert">
          <span>Out of messages. The vault stays sealed.</span>
          <button type="button" onClick={onRestart}>
            Retry
          </button>
        </div>
      )}

      <form className="composer" onSubmit={submit}>
        {wardens.length > 1 && (
          <div className="talk-to" role="group" aria-label="Talk to">
            <span className="muted">Talk to</span>
            {wardens.map((w) => (
              <button
                key={w.id}
                type="button"
                className="chip"
                aria-pressed={w.id === active?.id}
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
        {playing && active?.suggestions && active.suggestions.length > 0 && (
          <div className="suggestions" role="group" aria-label="Example messages">
            {active.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="chip suggestion"
                disabled={busy}
                onClick={() => {
                  setText(s);
                  inputRef.current?.focus();
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="composer-row">
          <label htmlFor="msg" className="sr-only">
            Message to {wardenName}
          </label>
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
          />
          <button type="submit" className="primary" disabled={busy || !playing || text.trim() === ""}>
            Send
          </button>
        </div>
      </form>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
