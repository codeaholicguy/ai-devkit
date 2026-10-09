import fs from "fs";
import path from "path";
import { Command } from "commander";
import {
  AGENT_MODES,
  HARNESS_RUNTIME_PROFILES,
  parseTmuxRuntimeRef,
  startAgent,
  TmuxUnavailableError,
  AgentNameInUseError,
  AgentPidPollTimeoutError,
  AgentRuntimeUnavailableError,
  type DurableProvider,
  type StartableAgentType,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { enableDebug } from "../../util/debug.js";
import { AGENT_NAME_REGEX, generateAgentName } from "../../util/agent.js";
import { resolveTmuxInstallInstructions } from "../../util/tmux.js";
import { createTmuxInspectionDeps } from "../../util/tmux-deps.js";
import { ConfigManager } from "../../lib/Config.js";
import { createDurableAgentService } from "./factory.js";
import { formatCwd, formatPrintProvider } from "./render.js";

async function reportStartError(err: unknown): Promise<void> {
  if (err instanceof TmuxUnavailableError) {
    const instructions = await resolveTmuxInstallInstructions(
      createTmuxInspectionDeps(),
    );
    ui.error(
      `tmux is not installed or not in PATH. ${instructions.message}`,
    );
  } else if (err instanceof AgentRuntimeUnavailableError) {
    ui.error(`Herdr runtime is unavailable (${err.reason}): ${err.detail}`);
  } else if (err instanceof AgentNameInUseError) {
    ui.error(
      `Agent "${err.agentName}" is already running (PID ${err.pid}). Choose a different name.`,
    );
  } else if (err instanceof AgentPidPollTimeoutError) {
    ui.error(
      `Agent process not found after ${err.timeoutMs / 1000}s. ` +
        `Verify that "${err.command}" is in PATH inside the tmux environment.`,
    );
  } else {
    throw err;
  }
}

export function registerAgentStartCommand(agentCommand: Command): void {
  agentCommand
    .command("start")
    .description("Start a new agent in the configured interactive runtime")
    .requiredOption(
      "--type <type>",
      `Agent type: ${Object.keys(HARNESS_RUNTIME_PROFILES).join(", ")}`,
    )
    .option(
      "--mode <mode>",
      "Agent mode: interactive or durable",
      "interactive",
    )
    .option(
      "--name <name>",
      "Human-readable name for the agent (lowercase alphanumeric + hyphens, 2-64 chars; default: {folder}-{timestamp})",
    )
    .option(
      "--cwd <path>",
      "Working directory for the agent (default: current directory)",
    )
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("start agent", async (options) => {
        if (options.debug) {
          enableDebug();
        }
        const agentType = options.type as string;
        const mode = options.mode as string;
        const cwd = path.resolve(options.cwd ?? process.cwd());
        const agentName =
          (options.name as string | undefined) ?? generateAgentName(cwd);

        if (!(agentType in HARNESS_RUNTIME_PROFILES)) {
          ui.error(
            `Unsupported agent type "${agentType}". Supported: ${Object.keys(HARNESS_RUNTIME_PROFILES).join(", ")}.`,
          );
          process.exit(1);
        }
        if (!["interactive", "durable"].includes(mode)) {
          throw new Error(
            `Unsupported agent mode "${mode}". Supported: interactive, durable.`,
          );
        }
        const internalMode =
          mode === "durable" ? AGENT_MODES.DURABLE : AGENT_MODES.INTERACTIVE;
        if (
          internalMode === AGENT_MODES.DURABLE &&
          !["claude", "codex", "pi"].includes(agentType)
        ) {
          throw new Error(
            "Durable mode currently supports only --type claude, --type codex, or --type pi.",
          );
        }
        if (!AGENT_NAME_REGEX.test(agentName)) {
          ui.error(
            `Invalid name "${agentName}". Use lowercase letters, digits, and hyphens only. ` +
              "Must start and end with a letter or digit, 2–64 characters.",
          );
          process.exit(1);
        }
        if (!fs.existsSync(cwd)) {
          ui.error(`Directory "${cwd}" does not exist.`);
          process.exit(1);
        }

        try {
          if (internalMode === AGENT_MODES.DURABLE) {
            const entry = await createDurableAgentService(
              agentType as DurableProvider,
            ).create({
              name: agentName,
              cwd,
            });
            ui.success(
              `Durable agent "${entry.name}" started (${entry.provider}, ID ${entry.id})`,
            );
            ui.text(`Working directory: ${formatCwd(entry.cwd)}`);
            ui.text(
              `State: ready (${formatPrintProvider(entry.provider)} session not started)`,
            );
            return;
          }
          const runtimeProvider =
            await new ConfigManager().getAgentRuntimeProvider();
          const entry = await startAgent(
            {
              type: agentType as StartableAgentType,
              name: agentName,
              cwd,
              runtimeProvider,
            },
            { onWarning: (msg: string) => ui.warning(msg) },
          );
          ui.success(
            `Agent "${entry.name}" started (${entry.type}, PID ${entry.pid})`,
          );
          ui.text(`Working directory: ${formatCwd(entry.cwd)}`);
          if (entry.runtime === "herdr") {
            ui.text("Runtime: herdr");
          } else {
            const tmuxRef = parseTmuxRuntimeRef(entry.runtimeRef);
            if (tmuxRef) ui.text(`Attach: tmux attach -t ${tmuxRef.session}`);
          }
        } catch (err) {
          await reportStartError(err);
          process.exit(1);
        }
      }),
    );
}
