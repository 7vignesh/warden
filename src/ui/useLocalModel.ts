import { useEffect, useState } from "react";
import type { LoadStatus, LocalModel } from "../warden/llm/client";

/**
 * Subscribes to a LocalModel's load status and checks WebGPU support on mount.
 * It never downloads the model; that happens only when the player clicks Load (R5.2).
 */
export function useLocalModel(model: LocalModel): LoadStatus {
  const [status, setStatus] = useState<LoadStatus>(() => model.getStatus());
  useEffect(() => model.subscribe(setStatus), [model]);
  useEffect(() => {
    void model.probe();
  }, [model]);
  return status;
}
