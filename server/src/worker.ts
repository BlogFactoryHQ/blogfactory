import { persistentBackgroundExecution } from "./services/background-drain.js";
import { runBackgroundWorker } from "./services/background-worker.js";

if (!persistentBackgroundExecution()) {
  throw new Error("BACKGROUND_EXECUTION_MODE=worker is required");
}

const controller = new AbortController();
process.on("SIGINT", () => controller.abort());
process.on("SIGTERM", () => controller.abort());

await runBackgroundWorker(process.env, controller.signal);
