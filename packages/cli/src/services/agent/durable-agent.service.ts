import type { DurableAgentRepository, DurableProvider } from "@ai-devkit/agent-manager";
import {
  DaemonRpcError,
  ensureDaemon,
  type DaemonClient,
  type DurableAgentWire,
} from "@ai-devkit/daemon-client";
import { createLogger } from "../../util/debug.js";

const debug = createLogger("agent:durable");

type DurableAgent = NonNullable<Awaited<ReturnType<DurableAgentRepository["getById"]>>>;

interface SendResult {
  agentId: string;
  agentName: string;
  sessionId: string;
  result: string;
  exitCode: number;
}

function agentFromWire(agent: DurableAgentWire): DurableAgent {
  if (agent.provider !== "codex" && agent.providerSessionId === null)
    throw new Error("Invalid daemon durable session binding.");
  return agent as DurableAgent;
}

function isUnknownMethod(error: unknown): boolean {
  return (
    error instanceof DaemonRpcError &&
    (error.code === "unknown_method" || error.message.startsWith("unknown method"))
  );
}

/** Daemon-backed CLI service for durable agents. */
export class DurableAgentService {
  constructor(readonly provider: DurableProvider) {}

  private async withDaemon<T>(
    operation: string,
    optional: boolean,
    fallback: T,
    run: (client: DaemonClient) => Promise<T>,
  ): Promise<T> {
    const client = await ensureDaemon({ onDebug: (msg) => debug(msg) });
    if (!client) {
      if (optional) {
        debug("%s: no daemon available -> skipping durable lookup", operation);
        return fallback;
      }
      throw new Error(
        "Durable agents require a running devkitd daemon. Run 'ai-devkit daemon start' and retry.",
      );
    }
    try {
      try {
        const capability = await client.durableCapabilities();
        debug(
          "%s: daemon durable capability v%d (owner=%s)",
          operation,
          capability.version,
          capability.owner,
        );
        if (capability.version !== 1)
          throw new Error("Unsupported daemon durable capability version.");
      } catch (error) {
        if (isUnknownMethod(error)) {
          if (optional) {
            debug(
              "%s: daemon predates durable RPCs (unknown method) -> skipping durable lookup",
              operation,
            );
            return fallback;
          }
          throw new Error(
            "Durable agents require an updated devkitd daemon. Run 'ai-devkit daemon stop' and retry.",
          );
        }
        throw error;
      }
      return await run(client);
    } finally {
      client.close();
    }
  }

  readonly repository = {
    list: (): Promise<DurableAgent[]> =>
      this.withDaemon("list", true, [], async (c) => (await c.listDurable()).map(agentFromWire)),
    resolve: (id: string): Promise<DurableAgent | DurableAgent[] | null> =>
      this.withDaemon("resolve", true, null, async (c) => {
        const a = await c.showDurable(id);
        return Array.isArray(a) ? a.map(agentFromWire) : a ? agentFromWire(a) : null;
      }),
  };

  create(input: { name: string; cwd: string }): Promise<DurableAgent> {
    return this.withDaemon("create", false, undefined as never, async (c) => {
      debug(
        "daemon path: durable.create name=%s provider=%s cwd=%s",
        input.name,
        this.provider,
        input.cwd,
      );
      return agentFromWire(await c.createDurable({ ...input, provider: this.provider }));
    });
  }

  send(reference: string, prompt: string): Promise<SendResult> {
    return this.withDaemon("send", false, undefined as never, async (c) => {
      const resolved = await c.showDurable(reference);
      if (!resolved) throw new Error(`Durable agent "${reference}" was not found.`);
      if (Array.isArray(resolved)) throw new Error(`Multiple durable agents match "${reference}".`);
      if (resolved.provider !== this.provider)
        throw new Error("Durable agent provider does not match.");
      debug("daemon path: durable.send id=%s provider=%s", resolved.id, this.provider);
      const launched = await c.sendDurable(resolved.id, prompt);
      debug("daemon path: run launched runId=%s; polling for completion", launched.runId);
      for (;;) {
        const { agent, run } = await c.showDurable(resolved.id, launched.runId);
        if (!run) throw new Error("Daemon lost the requested durable run.");
        if (run.status !== "running") {
          debug(
            "daemon path: run completed runId=%s status=%s exitCode=%s",
            launched.runId,
            run.status,
            run.exitCode,
          );
          if (run.status !== "succeeded")
            throw new Error(run.summary || `Durable run ${run.status}.`);
          if (run.exitCode !== 0 || !agent.providerSessionId)
            throw new Error("Invalid daemon durable completion.");
          return {
            agentId: agent.id,
            agentName: agent.name,
            sessionId: agent.providerSessionId,
            result: run.result ?? run.summary,
            exitCode: run.exitCode,
          };
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
  }
}
