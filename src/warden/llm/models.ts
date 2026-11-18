export interface ModelInfo {
  readonly id: string;
  readonly label: string;
  /** Weight download size, measured from the model's tensor-cache.json on Hugging Face. */
  readonly downloadMB: number;
  /** vram_required_MB from web-llm 0.2.89 prebuiltAppConfig. */
  readonly vramMB: number;
}

/** Models compared by the go/no-go benchmark (R8.2). tests/llm.models.test.ts checks them against web-llm. */
export const CANDIDATE_MODELS: readonly ModelInfo[] = [
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC", label: "Qwen2.5 1.5B", downloadMB: 828, vramMB: 1630 },
  { id: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC", label: "Hermes 3 (Llama 3.2 3B)", downloadMB: 1724, vramMB: 2264 },
];

/** Model the game loads in AI mode. Provisional until the benchmark decision (task 4.8). */
export const GAME_MODEL: ModelInfo = CANDIDATE_MODELS[0] as ModelInfo;

/** Installed @mlc-ai/web-llm version, recorded in benchmark results. tests/llm.test.ts checks it. */
export const WEBLLM_VERSION = "0.2.89";
