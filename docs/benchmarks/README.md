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
