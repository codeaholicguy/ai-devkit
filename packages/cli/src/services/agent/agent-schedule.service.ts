import {
  DaemonRpcError,
  ensureDaemon,
  type DaemonClient,
  type ScheduleCreateParams,
  type ScheduleListParams,
  type ScheduledSend,
} from "@ai-devkit/daemon-client";

export type {
  ScheduleCreateParams,
  ScheduleListParams,
  ScheduledSend,
} from "@ai-devkit/daemon-client";

export class ScheduledSendNotFoundError extends Error {
  constructor(public scheduleId: string) {
    super(`Scheduled send "${scheduleId}" not found.`);
    this.name = "ScheduledSendNotFoundError";
  }
}

export class ScheduledSendNotCancellableError extends Error {
  constructor(
    public scheduleId: string,
    public status?: string,
    message?: string,
  ) {
    super(
      message ??
        `Cannot cancel scheduled send "${scheduleId}"${status ? `: status is "${status}"` : ""}.`,
    );
    this.name = "ScheduledSendNotCancellableError";
  }
}

export class ScheduledSendInvalidParamsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledSendInvalidParamsError";
  }
}

export class ScheduledSendStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScheduledSendStorageError";
  }
}

export interface AgentScheduleServiceOptions {
  client?: DaemonClient;
  onDebug?: (msg: string) => void;
}

function mapScheduleRpcError(error: unknown, context: { id?: string }): unknown {
  if (error instanceof Error && error.message.startsWith("unknown method")) {
    return new Error("Upgrade and restart devkitd to use scheduled sends.");
  }
  if (!(error instanceof DaemonRpcError)) return error;

  const details = error.details as { id?: string; status?: string } | undefined;
  const id = details?.id ?? context.id ?? "";
  let mapped: Error;
  switch (error.code) {
    case "not_found":
      mapped = new ScheduledSendNotFoundError(id);
      break;
    case "not_cancellable":
      mapped = new ScheduledSendNotCancellableError(id, details?.status, error.message);
      break;
    case "invalid_params":
      mapped = new ScheduledSendInvalidParamsError(error.message);
      break;
    case "storage":
      mapped = new ScheduledSendStorageError(error.message);
      break;
    default:
      return error;
  }
  mapped.message = error.message;
  return mapped;
}

/** Daemon-owned scheduled sends. Requires a running devkitd; no local fallback. */
export class AgentScheduleService {
  constructor(private readonly options?: AgentScheduleServiceOptions) {}

  async create(params: ScheduleCreateParams): Promise<ScheduledSend> {
    return this.withDaemon("schedule.create", (daemon) => daemon.createSchedule(params), {});
  }

  async list(params: ScheduleListParams = {}): Promise<ScheduledSend[]> {
    return this.withDaemon("schedule.list", (daemon) => daemon.listSchedules(params), {});
  }

  async cancel(id: string): Promise<ScheduledSend> {
    return this.withDaemon("schedule.cancel", (daemon) => daemon.cancelSchedule(id), { id });
  }

  private async withDaemon<T>(
    method: string,
    operation: (daemon: DaemonClient) => Promise<T>,
    context: { id?: string },
  ): Promise<T> {
    const debug = this.options?.onDebug;
    const owned = !this.options?.client;
    const daemon =
      this.options?.client ?? (await ensureDaemon(debug ? { onDebug: debug } : undefined));
    if (!daemon) {
      debug?.(`no daemon available for ${method}; refusing fallback`);
      throw new Error(
        "A running, capable daemon is required for scheduled sends. Start devkitd and retry.",
      );
    }
    debug?.(`daemon path: calling ${method}`);
    try {
      return await operation(daemon);
    } catch (error) {
      if (error instanceof DaemonRpcError && error.code) {
        debug?.(`daemon ${method} returned coded error ${error.code}`);
      } else if (error instanceof Error) {
        debug?.(`daemon ${method} failed: ${error.message}`);
      }
      throw mapScheduleRpcError(error, context);
    } finally {
      if (owned) daemon.close();
    }
  }
}

export function createDefaultAgentScheduleService(
  options?: AgentScheduleServiceOptions,
): AgentScheduleService {
  return new AgentScheduleService(options);
}
