import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
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
interface LocalService {
  repository: Pick<DurableAgentRepository, "list" | "resolve">;
  create(input: { name: string; cwd: string }): Promise<DurableAgent>;
  send(id: string, prompt: string): Promise<SendResult>;
}
function agentFromWire(agent: DurableAgentWire): DurableAgent {
  if (agent.provider !== "codex" && agent.providerSessionId === null)
    throw new Error("Invalid daemon durable session binding.");
  return agent as DurableAgent;
}
/** Select authority before mutation, and never retry a possibly executed run. */
export class RoutedDurableService {
  constructor(
    readonly provider: DurableProvider,
    private readonly local: () => LocalService,
  ) {}
  private assertLocalOwnership(): void {
    if (existsSync(join(homedir(), ".ai-devkit", "durable-owner-v1.json"))) {
      debug("local fallback blocked by durable-owner-v1.json fence");
      throw new Error(
        "Durable agents are owned by devkitd. Restore a compatible daemon; local fallback is disabled after migration.",
      );
    }
  }
  private async route<T>(
    operation: string,
    remote: (client: DaemonClient) => Promise<T>,
    local: (service: LocalService) => Promise<T>,
  ): Promise<T> {
    const client = await ensureDaemon({ onDebug: (msg) => debug(msg) });
    if (!client) {
      debug("%s: no daemon available -> local durable fallback (%s)", operation, this.provider);
      this.assertLocalOwnership();
      return local(this.local());
    }
    try {
      let unsupported = false;
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
        if (
          error instanceof DaemonRpcError &&
          (error.code === "unknown_method" || error.message.startsWith("unknown method"))
        ) {
          debug(
            "%s: daemon predates durable RPCs (unknown method) -> local durable fallback (%s)",
            operation,
            this.provider,
          );
          unsupported = true;
        } else throw error;
      }
      if (unsupported) {
        this.assertLocalOwnership();
        return await local(this.local());
      }
      return await remote(client);
    } finally {
      client.close();
    }
  }
  readonly repository = {
    list: (): Promise<DurableAgent[]> =>
      this.route(
        "list",
        async (c) => (await c.listDurable()).map(agentFromWire),
        (s) => s.repository.list(),
      ),
    resolve: (id: string): Promise<DurableAgent | DurableAgent[] | null> =>
      this.route(
        "resolve",
        async (c) => {
          const a = await c.showDurable(id);
          return Array.isArray(a) ? a.map(agentFromWire) : a ? agentFromWire(a) : null;
        },
        (s) => s.repository.resolve(id),
      ),
  };
  create(input: { name: string; cwd: string }): Promise<DurableAgent> {
    return this.route(
      "create",
      async (c) => {
        debug(
          "daemon path: durable.create name=%s provider=%s cwd=%s",
          input.name,
          this.provider,
          input.cwd,
        );
        return agentFromWire(await c.createDurable({ ...input, provider: this.provider }));
      },
      (s) => {
        debug(
          "local path: creating durable agent name=%s provider=%s cwd=%s",
          input.name,
          this.provider,
          input.cwd,
        );
        return s.create(input);
      },
    );
  }
  send(reference: string, prompt: string): Promise<SendResult> {
    return this.route(
      "send",
      async (c) => {
        const resolved = await c.showDurable(reference);
        if (!resolved) throw new Error(`Durable agent "${reference}" was not found.`);
        if (Array.isArray(resolved))
          throw new Error(`Multiple durable agents match "${reference}".`);
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
      },
      (s) => {
        debug(
          "local path: sending to durable agent reference=%s provider=%s",
          reference,
          this.provider,
        );
        return s.send(reference, prompt);
      },
    );
  }
}
