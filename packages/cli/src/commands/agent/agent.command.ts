import { Command } from "commander";
import { registerAgentStartCommand } from "./start.command.js";
import { registerAgentListCommand } from "./list.command.js";
import { registerAgentSessionsCommand } from "./sessions.command.js";
import { registerAgentGroupCommand } from "./group.command.js";
import { registerAgentSessionCommand } from "./session.command.js";
import { registerAgentOpenCommand } from "./open.command.js";
import { registerAgentSendCommand } from "./send.command.js";
import { registerAgentKillCommand } from "./kill.command.js";
import { registerAgentDetailCommand } from "./detail.command.js";
import { registerAgentRenameCommand } from "./rename.command.js";
import { registerAgentConsoleCommand } from "./console.command.js";

export function registerAgentCommand(program: Command): void {
  const agentCommand = program.command("agent").description("Manage AI Agents");

  registerAgentStartCommand(agentCommand);
  registerAgentListCommand(agentCommand);
  registerAgentSessionsCommand(agentCommand);
  registerAgentGroupCommand(agentCommand);
  registerAgentSessionCommand(agentCommand);
  registerAgentOpenCommand(agentCommand);
  registerAgentSendCommand(agentCommand);
  registerAgentKillCommand(agentCommand);
  registerAgentDetailCommand(agentCommand);
  registerAgentRenameCommand(agentCommand);
  registerAgentConsoleCommand(agentCommand);
}
