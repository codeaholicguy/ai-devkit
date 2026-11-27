import { parentPort, workerData } from "node:worker_threads";

process.env.AI_DEVKIT_SESSION_REGISTRY_LOCK_WAIT_MS = "100";

const { updateRegistry } = await import("../../extensions/session-registry.ts");
const { file } = workerData as { file: string };

const ok = updateRegistry(file, () => {});
parentPort?.postMessage(ok);
