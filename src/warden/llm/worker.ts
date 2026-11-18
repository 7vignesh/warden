/// <reference lib="webworker" />
// Dedicated worker that hosts the web-llm engine, so model loading and inference never block the UI.
import { WebWorkerMLCEngineHandler } from "@mlc-ai/web-llm";

const handler = new WebWorkerMLCEngineHandler();
self.onmessage = (event: MessageEvent) => {
  handler.onmessage(event);
};
