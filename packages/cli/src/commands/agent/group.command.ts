import { Command } from "commander";
import chalk from "chalk";
import { ui } from "../../util/terminal-ui.js";
import { withErrorHandler } from "../../util/errors.js";
import { createLogger, enableDebug } from "../../util/debug.js";
import { createDefaultAgentGroupService } from "../../services/agent/agent-group.service.js";

const debug = createLogger("agent:group");

function collectAgentMember(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function groupService(options?: { debug?: boolean }) {
  if (options?.debug) {
    enableDebug();
  }
  return createDefaultAgentGroupService({ onDebug: debug });
}

export function registerAgentGroupCommand(agentCommand: Command): void {
  const groupCommand = agentCommand.command("group").description("Manage named groups of agents");

  groupCommand
    .command("create <name>")
    .description("Create an agent group")
    .option(
      "--agent <identifier>",
      "Agent identifier to include in the group",
      collectAgentMember,
      [] as string[],
    )
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "manage agent group",
        async (name: string, options: { agent?: string[]; debug?: boolean }) => {
          const group = await groupService(options).create(name, options.agent ?? []);
          ui.success(`Created agent group "${group.name}" with ${group.members.length} member(s).`);
        },
      ),
    );

  groupCommand
    .command("update <name>")
    .description("Replace all members in an agent group")
    .option(
      "--agent <identifier>",
      "Agent identifier to include in the group",
      collectAgentMember,
      [] as string[],
    )
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "manage agent group",
        async (name: string, options: { agent?: string[]; debug?: boolean }) => {
          const group = await groupService(options).update(name, options.agent ?? []);
          ui.success(`Updated agent group "${group.name}" with ${group.members.length} member(s).`);
        },
      ),
    );

  groupCommand
    .command("add <name> <identifier>")
    .description("Add an agent identifier to a group")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "manage agent group",
        async (name: string, identifier: string, options: { debug?: boolean }) => {
          const group = await groupService(options).addMember(name, identifier);
          ui.success(`Agent group "${group.name}" now has ${group.members.length} member(s).`);
        },
      ),
    );

  groupCommand
    .command("remove-agent <name> <identifier>")
    .description("Remove an agent identifier from a group")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler(
        "manage agent group",
        async (name: string, identifier: string, options: { debug?: boolean }) => {
          const group = await groupService(options).removeMember(name, identifier);
          ui.success(`Agent group "${group.name}" now has ${group.members.length} member(s).`);
        },
      ),
    );

  groupCommand
    .command("remove <name>")
    .description("Remove an agent group")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("manage agent group", async (name: string, options: { debug?: boolean }) => {
        await groupService(options).remove(name);
        ui.success(`Removed agent group "${name}".`);
      }),
    );

  groupCommand
    .command("list")
    .description("List configured agent groups")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("manage agent group", async (options: { debug?: boolean }) => {
        const groups = await groupService(options).list();
        if (groups.length === 0) {
          ui.info("No agent groups configured.");
          return;
        }
        ui.table({
          headers: ["Group", "Members"],
          rows: groups.map((group) => [group.name, group.members.join(", ")]),
          columnStyles: [(text) => chalk.cyan(text), (text) => text],
        });
      }),
    );

  groupCommand
    .command("detail <name>")
    .description("Show one configured agent group")
    .option("--debug", "Enable debug logging")
    .action(
      withErrorHandler("manage agent group", async (name: string, options: { debug?: boolean }) => {
        const group = await groupService(options).get(name);
        ui.text(`Agent Group: ${group.name}`, { breakline: true });
        for (const member of group.members) {
          ui.text(`  - ${member}`);
        }
      }),
    );
}
