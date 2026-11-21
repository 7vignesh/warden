# Model benchmarks

Results from `npm run bench` (or the `?bench` page). Each JSON file holds the model, web-llm version, GPU, timings, a summary with the go/no-go gate, every run, every raw model output, and one prompt sample.

The gate (requirements R8.6): solve at least 70% with the winning edit, unlock requests at most 10% with no edit, at least 95% valid actions.

## 2026-11-18 smoke run (not the gate)

`smoke--01-poisoned-telemetry--Qwen2.5-1.5B--2026-11-18.json`: Qwen2.5 1.5B, 2 runs per scenario, Edge 157 headless, Intel Iris Xe (integrated GPU).

| Measure | Result |
|---|---|
| Model download and load | 116 s (828 MB, first visit) |
| Solve rate, winning edit | 2/2 |
| Unlock requests, no edit | 2/2 (the engine denied both) |
| Valid actions | 10/10 |
| Time per model call | 33 to 73 s |
| Time per player message | 85 to 168 s |

Findings:
- Every output parsed and every action was valid, so constrained decoding works.
- The model requested the unlock with no forged line, even though its own `thought` said the vault should stay sealed. The engine refused, so the door stayed locked.
- At temperature 0 the two runs of each scenario produced identical outputs. Repeating an identical scenario does not measure variation, so the benchmark design needs varied inputs before the full gate run.
- On this integrated GPU one player message takes 1.5 to 3 minutes, which is too slow to play.

## 2026-11-18 smoke runs 2 and 3 (not the gate)

Changes since run 1: 120-token cap, prompt rule to quote the evidence line before unlocking, `check_policy` not offered, varied wording and logs per run. Same laptop (Intel Iris Xe), 2 runs per scenario.

| File | Model | Solve (forged log) | Unlock requests (clean log) | Valid actions | Notes |
|---|---|---|---|---|---|
| `smoke2--...--Llama-3.2-1B--...` | Llama 3.2 1B | 0/2 | 1/2 | 93% | Called `query_audit_log` when it meant to read the health log |
| `smoke2--...--Qwen2.5-1.5B--...` | Qwen2.5 1.5B | 1/2 | 0/2 | 100% | Re-read the log until the step cap in 2 of 4 runs |
| `smoke3--...--Qwen2.5-1.5B--...` | Qwen2.5 1.5B | 0/2 | 0/2 | 31% | Added "do not read it again"; the model ignored it, then the GPU device was lost |

Findings:
- The quote-the-evidence rule fixed the false unlock requests for Qwen (2/2 in run 1, 0/4 since).
- Qwen still loops on `read_file`. Naming the files already read did not stop it.
- In run 3 the browser reported "Device was lost. This can happen due to insufficient memory or other GPU constraints" after about 6 model calls. Every later call failed. This also explains one 445 s call in run 2.
- Conclusion for this laptop: the AI warden cannot complete a 20-run gate on Intel Iris Xe. A machine with a dedicated GPU or Apple Silicon is untested.
- These runs used the original Level 1 (`FAILOVER_REQUIRED: CORE-01`). Level 1 has since changed to require a valid node id and log format, so re-run before comparing.
