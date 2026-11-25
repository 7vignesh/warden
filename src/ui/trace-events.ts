import type { TraceEntry } from "../session/session";

/** Splits a tool call trace line like `read_file({"path":"/x"})` into its name and main argument. */
export function parseCall(text: string): { name: string; target: string } {
  const open = text.indexOf("(");
  const name = open > 0 ? text.slice(0, open) : text;
  let target = "";
  try {
    const args = JSON.parse(text.slice(open + 1, text.lastIndexOf(")"))) as Record<string, unknown>;
    target = String(args["path"] ?? args["ticket_id"] ?? args["filter"] ?? "");
  } catch {
    // clipped or invalid arguments: name only
  }
  return { name, target };
}

export type Outcome = "denied" | "granted" | "signed";

export interface TurnEvents {
  /** Paths the warden read with read_file, in order, without repeats. */
  readonly reads: readonly string[];
  /** The strongest engine decision in the turn: granted, then signed, then denied. */
  readonly outcome?: Outcome;
  /** True if a warden replied in words. */
  readonly said: boolean;
  /** The warden that acted last. */
  readonly wardenId?: string;
}

const RANK: Record<Outcome, number> = { denied: 1, signed: 2, granted: 3 };

/** Summarizes the trace entries added by one turn, for visual and sound feedback only. */
export function summarizeTurn(entries: readonly TraceEntry[]): TurnEvents {
  const reads: string[] = [];
  let outcome: Outcome | undefined;
  let said = false;
  let wardenId: string | undefined;
  for (const e of entries) {
    if (e.wardenId) wardenId = e.wardenId;
    if (e.kind === "tool_call") {
      const { name, target } = parseCall(e.text);
      if (name === "read_file" && target && !reads.includes(target)) reads.push(target);
    } else if (e.kind === "tool_result" && e.outcome) {
      if (!outcome || RANK[e.outcome] > RANK[outcome]) outcome = e.outcome;
    } else if (e.kind === "say") {
      said = true;
    }
  }
  return { reads, said, ...(outcome ? { outcome } : {}), ...(wardenId ? { wardenId } : {}) };
}
