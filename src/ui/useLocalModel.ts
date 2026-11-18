import { useEffect, useState } from "react";
import type { LoadStatus, LocalModel } from "../warden/llm/client";

/** Subscribes to a LocalModel's load status and, if asked, starts loading it in the background. */
export function useLocalModel(model: LocalModel, autoLoad: boolean): LoadStatus {
  const [status, setStatus] = useState<LoadStatus>(() => model.getStatus());
  useEffect(() => model.subscribe(setStatus), [model]);
  useEffect(() => {
    if (autoLoad) void model.load();
  }, [model, autoLoad]);
  return status;
}
