export { DaemonClient, daemonSocketPath, DaemonRpcError } from "./client.js";
export type { DaemonEvent } from "./client.js";
export type { AgentStartParams } from "./gen/AgentStartParams.js";
export type { AgentStartResult } from "./gen/AgentStartResult.js";
export type { EnrichedAgent, Event } from "./gen/index.js";
export { resolveDaemonBinary, resolveDaemonBinaryInfo } from "./binary.js";
export type { DaemonBinary } from "./binary.js";
export { ensureDaemon } from "./autostart.js";
