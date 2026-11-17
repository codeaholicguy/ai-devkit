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
      throw new Error(
        "Durable agents are owned by devkitd. Restore a compatible daemon; local fallback is disabled after migration.",
      );
    }
  }
  private async route<T>(
    remote: (client: DaemonClient) => Promise<T>,
    local: (service: LocalService) => Promise<T>,
  ): Promise<T> {
    const client = await ensureDaemon();
    if (!client) {
      this.assertLocalOwnership();
      return local(this.local());
    }
    try {
      let unsupported = false;
      try {
        const capability = await client.durableCapabilities();
        if (capability.version !== 1)
          throw new Error("Unsupported daemon durable capability version.");
      } catch (error) {
        if (
          error instanceof DaemonRpcError &&
          (error.code === "unknown_method" || error.message.startsWith("unknown method"))
        )
          unsupported = true;
        else throw error;
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
        async (c) => (await c.listDurable()).map(agentFromWire),
        (s) => s.repository.list(),
      ),
    resolve: (id: string): Promise<DurableAgent | DurableAgent[] | null> =>
      this.route(
        async (c) => {
          const a = await c.showDurable(id);
          return Array.isArray(a) ? a.map(agentFromWire) : a ? agentFromWire(a) : null;
        },
        (s) => s.repository.resolve(id),
      ),
  };
  create(input: { name: string; cwd: string }): Promise<DurableAgent> {
    return this.route(
      async (c) => agentFromWire(await c.createDurable({ ...input, provider: this.provider })),
      (s) => s.create(input),
    );
  }
  send(reference: string, prompt: string): Promise<SendResult> {
    return this.route(
      async (c) => {
        const resolved = await c.showDurable(reference);
        if (!resolved) throw new Error(`Durable agent "${reference}" was not found.`);
        if (Array.isArray(resolved))
          throw new Error(`Multiple durable agents match "${reference}".`);
        if (resolved.provider !== this.provider)
          throw new Error("Durable agent provider does not match.");
        const launched = await c.sendDurable(resolved.id, prompt);
        for (;;) {
          const { agent, run } = await c.showDurable(resolved.id, launched.runId);
          if (!run) throw new Error("Daemon lost the requested durable run.");
          if (run.status !== "running") {
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
      (s) => s.send(reference, prompt),
    );
  }
}
