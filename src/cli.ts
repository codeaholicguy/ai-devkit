#!/usr/bin/env node

import { Command } from "commander";
import { initCommand } from "./commands/init";
import { phaseCommand } from "./commands/phase";

const program = new Command();

program
  .name("ai-devkit")
  .description("AI-assisted software development toolkit")
  .version("0.3.2");

program
  .command("init")
  .description("Initialize AI DevKit in the current directory")
  .option(
    "-e, --environment <env>",
    "Development environment (cursor|claude|both)",
  )
  .option("-a, --all", "Initialize all phases")
  .option(
    "-p, --phases <phases>",
    "Comma-separated list of phases to initialize",
  )
  .action(initCommand);

program
  .command("phase [name]")
  .description(
    "Add a specific phase template (requirements|design|planning|implementation|testing|deployment|monitoring)",
  )
  .action(phaseCommand);

program.parse();
