import { parentPort, workerData } from "node:worker_threads";
import { updateRegistry } from "../../extensions/session-registry.ts";

const { file, pid, sessionPath } = workerData as {
  file: string;
  pid: string;
  sessionPath: string;
};

updateRegistry(file, (registry) => {
  registry[pid] = sessionPath;
});

parentPort?.postMessage("done");
