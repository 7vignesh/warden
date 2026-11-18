import type { ChatMessage, ChatModel } from "./chat";

export type LoadStatus =
  | { readonly kind: "idle" }
  | { readonly kind: "unsupported"; readonly reason: string }
  /** WebGPU works here, and nothing has been downloaded. The player can choose to load the model. */
  | { readonly kind: "available" }
  | { readonly kind: "downloading"; readonly progress: number; readonly text: string }
  | { readonly kind: "ready" }
  | { readonly kind: "failed"; readonly reason: string };

type Listener = (status: LoadStatus) => void;

interface GpuLike {
  requestAdapter(): Promise<{ features: { has(name: string): boolean } } | null>;
}

/** Checks WebGPU support before anything is downloaded (R5.2, R5.4). */
export async function checkWebGpu(): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (typeof navigator === "undefined") return { ok: false, reason: "No browser environment." };
  const gpu = (navigator as Navigator & { gpu?: GpuLike }).gpu;
  if (!gpu) return { ok: false, reason: "This browser does not support WebGPU." };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "WebGPU is available, but no GPU adapter was found." };
    if (!adapter.features.has("shader-f16")) {
      return { ok: false, reason: "This GPU does not support 16-bit shaders (shader-f16), which the model needs." };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: `WebGPU check failed: ${e instanceof Error ? e.message : String(e)}` };
  }
}

/** Turns a model load error into a sentence a player can act on. The raw message is kept at the end. */
export function describeLoadError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|networkerror|network error|err_/i.test(raw)) return `Could not download the model. Check your connection. (${raw})`;
  if (/quota|storage|cache/i.test(raw)) return `Not enough browser storage to cache the model. (${raw})`;
  if (/device|adapter|gpu|out of memory|oom/i.test(raw)) return `The GPU could not run the model. (${raw})`;
  return raw;
}

/**
 * Loads a web-llm model in a Web Worker and exposes it as a ChatModel.
 * web-llm is imported lazily, so Simulator mode never downloads its code.
 */
export class LocalModel implements ChatModel {
  private status: LoadStatus = { kind: "idle" };
  private readonly listeners = new Set<Listener>();
  private engine: import("@mlc-ai/web-llm").WebWorkerMLCEngine | null = null;
  private loading: Promise<void> | null = null;
  private worker: Worker | null = null;
  /** Inference must run one request at a time. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(readonly modelId: string) {}

  getStatus(): LoadStatus {
    return this.status;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => this.listeners.delete(listener);
  }

  private set(status: LoadStatus): void {
    this.status = status;
    for (const l of this.listeners) l(status);
  }

  /**
   * Checks WebGPU without downloading anything, then reports "available" or "unsupported".
   * Does nothing once loading has started.
   */
  async probe(): Promise<void> {
    if (this.status.kind !== "idle") return;
    const gpu = await checkWebGpu();
    if (this.status.kind !== "idle") return;
    this.set(gpu.ok ? { kind: "available" } : { kind: "unsupported", reason: gpu.reason });
  }

  /** Downloads and starts the model. Only call this after the player asks (R5.2). Safe to call more than once. */
  load(): Promise<void> {
    if (this.loading) return this.loading;
    this.loading = this.doLoad();
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    const gpu = await checkWebGpu();
    if (!gpu.ok) {
      this.set({ kind: "unsupported", reason: gpu.reason });
      return;
    }
    this.set({ kind: "downloading", progress: 0, text: "Starting download" });
    try {
      const webllm = await import("@mlc-ai/web-llm");
      this.worker = new Worker(new URL("./worker.ts", import.meta.url), { type: "module" });
      this.engine = await webllm.CreateWebWorkerMLCEngine(this.worker, this.modelId, {
        initProgressCallback: (report) => {
          this.set({ kind: "downloading", progress: Math.max(0, Math.min(1, report.progress)), text: report.text });
        },
      });
      this.set({ kind: "ready" });
    } catch (e) {
      this.worker?.terminate();
      this.worker = null;
      this.engine = null;
      this.set({ kind: "failed", reason: describeLoadError(e) });
    }
  }

  /** Frees GPU memory and stops the worker. Afterwards the model can be loaded again. */
  async unload(): Promise<void> {
    const engine = this.engine;
    this.engine = null;
    this.loading = null;
    try {
      await engine?.unload();
    } finally {
      this.worker?.terminate();
      this.worker = null;
      this.set({ kind: "idle" });
    }
  }

  complete(messages: readonly ChatMessage[], jsonSchema: string, maxTokens: number): Promise<string> {
    const run = async () => {
      const engine = this.engine;
      if (!engine || this.status.kind !== "ready") throw new Error("model is not loaded");
      const reply = await engine.chat.completions.create({
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0,
        max_tokens: maxTokens,
        response_format: { type: "json_object", schema: jsonSchema },
      });
      return reply.choices[0]?.message?.content ?? "";
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }
}
