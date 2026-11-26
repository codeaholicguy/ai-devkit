import { Command } from "commander";
import { AGENT_MODES, AgentRegistry, TerminalFocusManager } from "@ai-devkit/agent-manager";
import {
  DaemonRpcError,
  ensureDaemon,
  type AgentLookupResult,
  type DaemonClient,
} from "@ai-devkit/daemon-client";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { createLogger, enableDebug } from "../../util/debug.js";
import { ANSI_ESCAPE_PATTERN, sanitizeProviderOutput } from "../../util/text.js";
import {
  assertSendTargetOptions,
  sendToAgent,
  sendToAgentGroup,
  type SendReporter,
} from "../../services/agent/agent.service.js";
import { resolveTextFromStdinOption } from "../../util/stdin.js";
import { parseDurationMs, parseFutureIsoTimestamp } from "../../util/time.js";
import { formatLocalTimestampWithRelative } from "../../util/time-format.js";
import { createDefaultAgentGroupService } from "../../services/agent/agent-group.service.js";
import { createDefaultAgentScheduleService } from "../../services/agent/agent-schedule.service.js";
import { resolveDurableAgentEntry } from "../../services/agent/resolve-agent.service.js";
import {
  createAgentManager,
  createDaemonEntryRegistry,
  createDurableAgentService,
} from "./factory.js";

const debug = createLogger("agent:send");

function writeWaitStatus(message: string): void {
  process.stderr.write(`${message.replace(ANSI_ESCAPE_PATTERN, "")}\n`);
}

async function resolveSendMessage(
  message: string | undefined,
  options: { stdin?: boolean },
): Promise<string> {
  return resolveTextFromStdinOption(
    message,
    options,
    "Message is required unless --stdin is used or stdin is piped.",
    "Use either a message argument or --stdin, not both.",
  );
}

/**
 * Daemon routing for `send --id`: agent.lookup resolves an exact registered
 * name to its runtime + runtimeRef, and the client sends through that entry
 * (no daemon-side send). Partial names are resolved locally first and the
 * full name is looked up after. `not_found` keeps the local registry,
 * `unknown method` disables daemon routing, dead registrations are refused,
 * and any other daemon error is surfaced without a local retry.
 */
function createDaemonSendRouter(daemon: DaemonClient) {
  let supported = true;
  const entries = new Map<string, AgentLookupResult | null>();

  async function lookup(name: string): Promise<AgentLookupResult | null> {
    if (!supported) return null;
    const cached = entries.get(name);
    if (cached !== undefined) return cached;

    let entry: AgentLookupResult;
    try {
      entry = await daemon.lookupAgent(name);
    } catch (err) {
      if (err instanceof DaemonRpcError && err.code === "not_found") {
        debug(`daemon has no registration named "${name}" -> local registry`);
        entries.set(name, null);
        return null;
      }
      if (err instanceof Error && err.message.startsWith("unknown method")) {
        debug("daemon predates agent.lookup (unknown method) -> legacy sendAgentPrompt path");
        supported = false;
        return null;
      }
      debug(
        err instanceof DaemonRpcError && err.code
          ? `daemon returned coded error ${err.code}; not retrying locally`
          : "transport failure mid-request; reporting without retry",
      );
      throw err;
    }
    debug(
      `daemon lookup: ${entry.name} pid=${entry.pid} runtime=${entry.runtime} alive=${entry.alive}`,
    );
    if (!entry.alive) {
      throw new Error(`Agent "${entry.name}" is registered but no longer running; not sending.`);
    }
    entries.set(name, entry);
    return entry;
  }

  return {
    /** Exact-name lookup before local resolution, so dead names fail clearly. */
    precheck: async (identifier: string): Promise<void> => {
      await lookup(identifier);
    },
    registryFor: async (agentName: string) => {
      const entry = await lookup(agentName);
      if (!entry) return undefined;
      debug(`sending to "${entry.name}" via daemon ${entry.runtime} runtimeRef`);
      return createDaemonEntryRegistry(entry);
    },
  };
}

function createCommandSendReporter(): SendReporter {
  return {
    info: (text) => (text.startsWith("  - ") ? ui.text(text) : ui.info(text)),
    warning: (text) => ui.warning(text),
    success: (text) => ui.success(text),
    error: (text) => ui.error(text),
  };
}

async function isLiveInteractiveTarget(daemon: DaemonClient, agentName: string): Promise<boolean> {
  try {
    const entry = await daemon.lookupAgent(agentName);
    return entry.alive;
  } catch (error) {
    if (!(error instanceof DaemonRpcError && error.code === "not_found")) {
      return false;
    }
  }
  try {
    const live = await daemon.listAgents();
    return live.some((agent) => agent.name === agentName);
  } catch {
    return false;
  }
}

export function registerAgentSendCommand(agentCommand: Command): void {
  agentCommand
    .command("send [message]")
    .description("Send a message to a running agent (or schedule one for later)")
    .option("--id <identifier>", "Agent name or partial match")
    .option("--group <name>", "Agent group name")
    .option("--in <duration>", "Schedule delivery after a relative duration (e.g. 15m, 2h, 1d)")
    .option(
      "--at <iso>",
      "Schedule delivery at an ISO-8601 UTC/offset timestamp (e.g. 2026-11-25T21:00:00Z)",
    )
    .option("--stdin", "Read the message from stdin")
    .option("--wait", "Wait for and print the agent response")
    .option("--timeout <milliseconds>", "Maximum time to wait with --wait, in milliseconds")
    .option("-j, --json", "Output wait or schedule result as JSON")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("send message", async (message, options) => {
        if (options.debug) {
          enableDebug();
        }
        assertSendTargetOptions(options);
        const prompt = await resolveSendMessage(message, options);

        if (options.in !== undefined || options.at !== undefined) {
          const manager = createAgentManager();
          const durableResolved = await resolveDurableAgentEntry(options.id, () =>
            manager.listAgents(),
          );
          if (durableResolved) {
            throw new Error(
              `Agent "${durableResolved.name}" is a durable agent; scheduled sends support direct pane delivery only.`,
            );
          }

          const daemon = await ensureDaemon({ onDebug: debug });
          if (!daemon) {
            throw new Error(
              "A running, capable daemon is required for scheduled sends. Start devkitd and retry.",
            );
          }
          try {
            const targetName = String(options.id).trim();
            if (!(await isLiveInteractiveTarget(daemon, targetName))) {
              const warn = `No running interactive agent named "${targetName}" right now; it will be resolved at fire time.`;
              if (options.json) {
                process.stderr.write(`Warning: ${warn}\n`);
              } else {
                ui.warning(warn);
              }
            }
            const dueAt =
              options.in !== undefined
                ? new Date(Date.now() + parseDurationMs(options.in)).toISOString()
                : parseFutureIsoTimestamp(options.at);
            const createdBy = process.env.AI_DEVKIT_AGENT_NAME?.trim() || undefined;
            const schedule = await createDefaultAgentScheduleService({
              client: daemon,
              onDebug: debug,
            }).create({
              agentName: targetName,
              message: prompt,
              dueAt,
              ...(createdBy ? { createdBy } : {}),
            });
            if (options.json) {
              console.log(JSON.stringify(schedule, null, 2));
            } else {
              ui.success(
                `Scheduled message for "${schedule.agentName}" at ${formatLocalTimestampWithRelative(new Date(schedule.dueAt))} [id: ${schedule.id}].`,
              );
            }
          } finally {
            daemon.close();
          }
          return;
        }

        const focusManager = new TerminalFocusManager();

        if (options.group) {
          const daemon = await ensureDaemon({ onDebug: debug });
          if (!daemon) {
            throw new Error(
              "A running, capable daemon is required for group sends. Start devkitd and retry.",
            );
          }
          try {
            const group = await createDefaultAgentGroupService({
              client: daemon,
              onDebug: debug,
            }).lookup(options.group);
            await sendToAgentGroup({
              group,
              prompt,
              lookupAgent: (name) => daemon.lookupAgent(name),
              focusManager,
            });
          } finally {
            daemon.close();
          }
          return;
        }

        const manager = createAgentManager();
        const durableResolved = await resolveDurableAgentEntry(options.id, () =>
          manager.listAgents(),
        );
        if (durableResolved) {
          debug(
            "resolved durable agent id=%s name=%s provider=%s state=%s",
            durableResolved.id,
            durableResolved.name,
            durableResolved.provider,
            durableResolved.state,
          );
          if (options.timeout !== undefined) {
            throw new Error("--timeout is not supported for synchronous durable agents.");
          }
          const providerService = createDurableAgentService(durableResolved.provider);
          const result = await providerService.send(options.id, prompt);
          debug(
            "durable send completed id=%s sessionId=%s exitCode=%d",
            result.agentId,
            result.sessionId,
            result.exitCode,
          );
          if (options.json) {
            console.log(
              JSON.stringify(
                {
                  target: {
                    id: result.agentId,
                    name: result.agentName,
                    provider: durableResolved.provider,
                    mode: AGENT_MODES.DURABLE,
                  },
                  response: result.result,
                  exitCode: result.exitCode,
                  sessionId: result.sessionId,
                },
                null,
                2,
              ),
            );
          } else {
            ui.text(sanitizeProviderOutput(result.result));
          }
          return;
        }

        const daemon = await ensureDaemon({ onDebug: debug });
        if (!daemon) debug("no daemon available -> legacy sendAgentPrompt path");
        try {
          const router = daemon ? createDaemonSendRouter(daemon) : undefined;
          await router?.precheck(options.id);
          await sendToAgent({
            id: options.id,
            prompt,
            manager,
            focusManager,
            registry: AgentRegistry.default(),
            resolveRegistry: router?.registryFor,
            wait: options.wait,
            timeout: options.timeout,
            json: options.json,
            reporter: createCommandSendReporter(),
            writeWaitStatus,
          });
        } finally {
          daemon?.close();
        }
      }),
    );
}
