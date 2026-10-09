export { DaemonClient, daemonSocketPath } from "./client.js";
export type { DaemonEvent } from "./client.js";
export type { EnrichedAgent, Event } from "./gen/index.js";
export { resolveDaemonBinary } from "./binary.js";
export { ensureDaemon } from "./autostart.js";
