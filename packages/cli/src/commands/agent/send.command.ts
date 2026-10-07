import { Command } from "commander";
import {
  AGENT_MODES,
  AgentRegistry,
  TerminalFocusManager,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { ANSI_ESCAPE_PATTERN, sanitizeProviderOutput } from "../../util/text.js";
import {
  assertSendTargetOptions,
  sendToAgent,
  sendToAgentGroup,
  type SendReporter,
} from "../../services/agent/agent.service.js";
import {
  AgentGroupNotFoundError,
  createDefaultAgentGroupService,
} from "../../services/agent/agent-group.service.js";
import { resolveDurableAgentEntry } from "../../services/agent/resolve-agent.service.js";
import {
  createAgentManager,
  createDurableAgentService,
} from "./factory.js";

function writeWaitStatus(message: string): void {
  process.stderr.write(`${message.replace(ANSI_ESCAPE_PATTERN, "")}\n`);
}

function readStdin(): Promise<string> {
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

async function resolveSendMessage(
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

function createCommandSendReporter(): SendReporter {
  return {
    info: (text) => (text.startsWith("  - ") ? ui.text(text) : ui.info(text)),
    warning: (text) => ui.warning(text),
    success: (text) => ui.success(text),
    error: (text) => ui.error(text),
  };
}

export function registerAgentSendCommand(agentCommand: Command): void {
  agentCommand
    .command("send [message]")
    .description("Send a message to a running agent")
    .option("--id <identifier>", "Agent name or partial match")
    .option("--group <name>", "Agent group name")
    .option("--stdin", "Read the message from stdin")
    .option("--wait", "Wait for and print the agent response")
    .option(
      "--timeout <milliseconds>",
      "Maximum time to wait with --wait, in milliseconds",
    )
    .option("-j, --json", "Output wait result as JSON")
    .action(
      withErrorHandler("send message", async (message, options) => {
        assertSendTargetOptions(options);
        const prompt = await resolveSendMessage(message, options);
        const manager = createAgentManager();
        const focusManager = new TerminalFocusManager();

        if (options.group) {
          const group = createDefaultAgentGroupService().get(options.group);
          if (!group) {
            throw new AgentGroupNotFoundError(options.group);
          }
          await sendToAgentGroup({ group, prompt, manager, focusManager });
          return;
        }

        const durableResolved = await resolveDurableAgentEntry(
          options.id,
          () => manager.listAgents(),
        );
        if (durableResolved) {
          if (options.timeout !== undefined) {
            throw new Error(
              "--timeout is not supported for synchronous durable agents.",
            );
          }
          const providerService = createDurableAgentService(
            durableResolved.provider,
          );
          const result = await providerService.send(options.id, prompt);
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

        await sendToAgent({
          id: options.id,
          prompt,
          manager,
          focusManager,
          registry: AgentRegistry.default(),
          wait: options.wait,
          timeout: options.timeout,
          json: options.json,
          reporter: createCommandSendReporter(),
          writeWaitStatus,
        });
      }),
    );
}
