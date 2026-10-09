export { DaemonClient, daemonSocketPath, connectDaemon } from "./client.js";
export type { DaemonEvent } from "./client.js";
export type {
  EnrichedAgent,
  Event,
  Request,
  Response,
} from "./gen/index.js";
export { resolveDaemonBinary } from "./binary.js";
export { ensureDaemon } from "./autostart.js";
