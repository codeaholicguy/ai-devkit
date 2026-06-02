import { CLI_COMMANDS, getCliCommand, type CommandModulePath, type CommandRow } from './cli-command-manifest.js';

interface LightweightResponse {
  handled: boolean;
  output?: string;
}

function renderCommandRows(rows: CommandRow[]): string {
  return rows
    .map((row) => `  ${row.usage.padEnd(30)} ${row.description}`)
    .join('\n');
}

function rootCommandRows(): CommandRow[] {
  return [
    ...CLI_COMMANDS.map((command) => ({
      usage: command.usage,
      description: command.rootDescription ?? command.description,
    })),
    { usage: 'help [command]', description: 'display help for command' },
  ];
}

function renderRootHelp(): string {
  return [
    'Usage: ai-devkit [options] [command]',
    '',
    'AI-assisted software development toolkit',
    '',
    'Options:',
    '  -V, --version                  output the version number',
    '  -h, --help                     display help for command',
    '',
    'Commands:',
    renderCommandRows(rootCommandRows()),
    '',
  ].join('\n');
}

function renderCommandHelp(commandName: string): string | undefined {
  const command = getCliCommand(commandName);
  if (!command) return undefined;

  const optionRows: CommandRow[] = [
    ...(command.options ?? []).map((option) => ({
      usage: option.flags,
      description: option.description,
    })),
    { usage: '-h, --help', description: 'display help for command' },
  ];
  const sections = [
    `Usage: ai-devkit ${command.usage}`,
    '',
    command.description,
    '',
    'Options:',
    renderCommandRows(optionRows),
  ];

  if (command.subcommands?.length) {
    sections.push(
      '',
      'Commands:',
      renderCommandRows([...command.subcommands, { usage: 'help [command]', description: 'display help for command' }]),
    );
  }

  sections.push('');
  return sections.join('\n');
}

function isHelpFlag(value: string | undefined): boolean {
  return value === '--help' || value === '-h';
}

export function resolveLightweightCliResponse(args: string[], version: string): LightweightResponse {
  const [first, second] = args;

  if (first === '--version' || first === '-V') {
    return { handled: true, output: `${version}\n` };
  }

  if (isHelpFlag(first) || first === undefined) {
    return { handled: true, output: renderRootHelp() };
  }

  if (isHelpFlag(second)) {
    const output = renderCommandHelp(first);
    if (output) {
      return { handled: true, output };
    }
  }

  return { handled: false };
}

export function resolveTopLevelCommandModule(args: string[]): CommandModulePath | undefined {
  return getCliCommand(args[0])?.modulePath;
}

async function createProgram(version: string) {
  const { Command } = await import('commander');
  return new Command()
    .name('ai-devkit')
    .description('AI-assisted software development toolkit')
    .version(version);
}

export async function registerSelectedCommand(
  program: Awaited<ReturnType<typeof createProgram>>,
  modulePath: CommandModulePath,
): Promise<void> {
  switch (modulePath) {
    case './commands/init.js': {
      const { initCommand } = await import('./commands/init.js');
      program
        .command('init')
        .description('Initialize AI DevKit in the current directory')
        .option('-e, --environment <env>', 'Development environment (cursor|claude|both)')
        .option('-a, --all', 'Initialize all phases')
        .option('-p, --phases <phases>', 'Comma-separated list of phases to initialize')
        .option('-t, --template <path>', 'Initialize from template file (.yaml, .yml, .json)')
        .option('-d, --docs-dir <path>', 'Custom directory for AI documentation (default: docs/ai)')
        .option('--built-in', 'Install AI DevKit built-in skills without prompting (useful for CI/non-interactive runs)')
        .option('-y, --yes', 'Run non-interactively. Without -t, requires -e <env> and one of -a/-p. Existing files are kept unless --overwrite is also passed.')
        .option('--overwrite', 'With --yes, overwrite existing environments and phase files instead of skipping them')
        .action(initCommand);
      break;
    }
    case './commands/phase.js': {
      const { phaseCommand } = await import('./commands/phase.js');
      program
        .command('phase [name]')
        .description('Add a specific phase template (requirements|design|planning|implementation|testing|deployment|monitoring)')
        .action(phaseCommand);
      break;
    }
    case './commands/setup.js': {
      const { setupCommand } = await import('./commands/setup.js');
      program
        .command('setup')
        .description('Set up AI DevKit commands globally')
        .option('-g, --global', 'Install commands to global environment folders')
        .action(setupCommand);
      break;
    }
    case './commands/lint.js': {
      const { lintCommand } = await import('./commands/lint.js');
      program
        .command('lint')
        .description('Validate workspace readiness for AI DevKit workflows')
        .option('-f, --feature <name>', 'Validate docs and git worktree conventions for a feature')
        .option('--json', 'Output lint results as JSON')
        .action(lintCommand);
      break;
    }
    case './commands/install.js': {
      const { installCommand } = await import('./commands/install.js');
      program
        .command('install')
        .description('Install AI DevKit artifacts from a project config')
        .option('-c, --config <path>', 'Path to config file (default: .ai-devkit.json)')
        .option('--overwrite', 'Overwrite existing install artifacts')
        .action(installCommand);
      break;
    }
    case './commands/memory.js': {
      const { registerMemoryCommand } = await import('./commands/memory.js');
      registerMemoryCommand(program);
      break;
    }
    case './commands/skill.js': {
      const { registerSkillCommand } = await import('./commands/skill.js');
      registerSkillCommand(program);
      break;
    }
    case './commands/agent.js': {
      const { registerAgentCommand } = await import('./commands/agent.js');
      registerAgentCommand(program);
      break;
    }
    case './commands/channel.js': {
      const { registerChannelCommand } = await import('./commands/channel.js');
      registerChannelCommand(program);
      break;
    }
    case './commands/docs.js': {
      const { registerDocsCommand } = await import('./commands/docs.js');
      registerDocsCommand(program);
      break;
    }
  }
}

export async function runSelectedCommand(argv: string[], version: string): Promise<void> {
  const program = await createProgram(version);
  const modulePath = resolveTopLevelCommandModule(argv.slice(2));

  if (modulePath) {
    await registerSelectedCommand(program, modulePath);
  } else {
    for (const command of CLI_COMMANDS) {
      program.command(command.usage).description(command.description);
    }
  }

  await program.parseAsync(argv);
}
