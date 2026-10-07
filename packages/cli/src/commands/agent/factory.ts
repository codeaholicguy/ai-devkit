import {
  AgentManager,
  AgentRegistry,
  createBuiltinAdapters,
  ClaudePrintAgentService,
  CodexPrintAgentService,
  DurableAgentRepository,
  PiPrintAgentService,
  type DurableProvider,
} from "@ai-devkit/agent-manager";
import { ConfigManager } from "../../lib/Config.js";
import { createLogger } from "../../util/debug.js";
import { ANSI_ESCAPE_PATTERN, getErrorMessage } from "../../util/text.js";
import { ui } from "../../util/terminal-ui.js";
import type { SendReporter } from "../../services/agent/agent.service.js";

export function createAgentManager(): AgentManager {
  const configManager = new ConfigManager();
  const manager = new AgentManager(AgentRegistry.default(), undefined, {
    runtimeProvider: () => configManager.getAgentRuntimeProvider(),
    onRuntimeDiscoveryError: (error) => {
      createLogger("agent")(
        `Herdr pane discovery unavailable for live agent enrichment: ${getErrorMessage(error)}`,
      );
    },
  });
  for (const adapter of createBuiltinAdapters()) manager.registerAdapter(adapter);
  return manager;
}

export function createDurableAgentService(
  provider: DurableProvider = "claude",
): ClaudePrintAgentService | CodexPrintAgentService | PiPrintAgentService {
  const repository = new DurableAgentRepository();
  if (provider === "codex") return new CodexPrintAgentService({ repository });
  if (provider === "pi") return new PiPrintAgentService({ repository });
  return new ClaudePrintAgentService({ repository });
}

export function writeWaitStatus(message: string): void {
  process.stderr.write(`${message.replace(ANSI_ESCAPE_PATTERN, "")}\n`);
}

export function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let input = "";

    const cleanup = () => {
      process.stdin.off("data", onData);
      process.stdin.off("end", onEnd);
      process.stdin.off("error", onError);
    };
    const onData = (chunk: Buffer | string) => {
      input += chunk.toString();
    };
    const onEnd = () => {
      cleanup();
      resolve(input);
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", onData);
    process.stdin.once("end", onEnd);
    process.stdin.once("error", onError);
  });
}

export async function resolveSendMessage(
  message: string | undefined,
  options: { stdin?: boolean },
): Promise<string> {
  if (message !== undefined && options.stdin) {
    throw new Error("Use either a message argument or --stdin, not both.");
  }

  if (options.stdin || (message === undefined && !process.stdin.isTTY)) {
    return readStdin();
  }

  if (message === undefined) {
    throw new Error(
      "Message is required unless --stdin is used or stdin is piped.",
    );
  }

  return message;
}

export function createCommandSendReporter(): SendReporter {
  return {
    info: (text) => (text.startsWith("  - ") ? ui.text(text) : ui.info(text)),
    warning: (text) => ui.warning(text),
    success: (text) => ui.success(text),
    error: (text) => ui.error(text),
  };
}
