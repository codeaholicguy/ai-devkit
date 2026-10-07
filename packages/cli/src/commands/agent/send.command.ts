import { Command } from "commander";
import {
  AGENT_MODES,
  AgentRegistry,
  DurableAgentRepository,
  TerminalFocusManager,
} from "@ai-devkit/agent-manager";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { sanitizeProviderOutput } from "../../util/text.js";
import {
  assertSendTargetOptions,
  sendToAgent,
  sendToAgentGroup,
} from "../../services/agent/agent.service.js";
import {
  AgentGroupNotFoundError,
  createDefaultAgentGroupService,
} from "../../services/agent/agent-group.service.js";
import { assertDurableNameUnambiguous } from "../../services/agent/resolve-agent.service.js";
import {
  createAgentManager,
  createCommandSendReporter,
  createDurableAgentService,
  resolveSendMessage,
  writeWaitStatus,
} from "./factory.js";

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

        const repository = new DurableAgentRepository();
        const durableResolved = await repository.resolve(options.id);
        if (Array.isArray(durableResolved)) {
          throw new Error(`Multiple durable agents match "${options.id}".`);
        }
        if (durableResolved) {
          const providerService = createDurableAgentService(
            durableResolved.provider,
          );
          if (options.timeout !== undefined) {
            throw new Error(
              "--timeout is not supported for synchronous durable agents.",
            );
          }
          if (options.id !== durableResolved.id) {
            const liveAgents = await manager.listAgents();
            assertDurableNameUnambiguous(
              options.id,
              durableResolved.id,
              liveAgents,
            );
          }
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
