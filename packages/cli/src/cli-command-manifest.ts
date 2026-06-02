export type CommandModulePath =
  | './commands/init.js'
  | './commands/phase.js'
  | './commands/setup.js'
  | './commands/lint.js'
  | './commands/install.js'
  | './commands/memory.js'
  | './commands/skill.js'
  | './commands/agent.js'
  | './commands/channel.js'
  | './commands/docs.js';

export interface CommandRow {
  usage: string;
  description: string;
}

export interface CommandOption {
  flags: string;
  description: string;
}

export interface CliCommandManifest {
  name: string;
  usage: string;
  description: string;
  rootDescription?: string;
  modulePath: CommandModulePath;
  options?: CommandOption[];
  subcommands?: CommandRow[];
}

export const CLI_COMMANDS: CliCommandManifest[] = [
  {
    name: 'init',
    usage: 'init [options]',
    description: 'Initialize AI DevKit in the current directory',
    modulePath: './commands/init.js',
    options: [
      { flags: '-e, --environment <env>', description: 'Development environment (cursor|claude|both)' },
      { flags: '-a, --all', description: 'Initialize all phases' },
      { flags: '-p, --phases <phases>', description: 'Comma-separated list of phases to initialize' },
      { flags: '-t, --template <path>', description: 'Initialize from template file (.yaml, .yml, .json)' },
      { flags: '-d, --docs-dir <path>', description: 'Custom directory for AI documentation (default: docs/ai)' },
      { flags: '--built-in', description: 'Install AI DevKit built-in skills without prompting (useful for CI/non-interactive runs)' },
      { flags: '-y, --yes', description: 'Run non-interactively. Without -t, requires -e <env> and one of -a/-p. Existing files are kept unless --overwrite is also passed.' },
      { flags: '--overwrite', description: 'With --yes, overwrite existing environments and phase files instead of skipping them' },
    ],
  },
  {
    name: 'phase',
    usage: 'phase [name]',
    description: 'Add a specific phase template (requirements|design|planning|implementation|testing|deployment|monitoring)',
    rootDescription: 'Add a specific phase template',
    modulePath: './commands/phase.js',
  },
  {
    name: 'setup',
    usage: 'setup [options]',
    description: 'Set up AI DevKit commands globally',
    modulePath: './commands/setup.js',
    options: [
      { flags: '-g, --global', description: 'Install commands to global environment folders' },
    ],
  },
  {
    name: 'lint',
    usage: 'lint [options]',
    description: 'Validate workspace readiness for AI DevKit workflows',
    modulePath: './commands/lint.js',
    options: [
      { flags: '-f, --feature <name>', description: 'Validate docs and git worktree conventions for a feature' },
      { flags: '--json', description: 'Output lint results as JSON' },
    ],
  },
  {
    name: 'install',
    usage: 'install [options]',
    description: 'Install AI DevKit artifacts from a project config',
    modulePath: './commands/install.js',
    options: [
      { flags: '-c, --config <path>', description: 'Path to config file (default: .ai-devkit.json)' },
      { flags: '--overwrite', description: 'Overwrite existing install artifacts' },
    ],
  },
  {
    name: 'memory',
    usage: 'memory [options] [command]',
    description: 'Interact with the knowledge memory service',
    modulePath: './commands/memory.js',
    subcommands: [
      { usage: 'store [options]', description: 'Store a new knowledge item' },
      { usage: 'update [options]', description: 'Update an existing knowledge item by ID' },
      { usage: 'search [options]', description: 'Search for knowledge items' },
    ],
  },
  {
    name: 'skill',
    usage: 'skill [options] [command]',
    description: 'Manage Agent Skills',
    modulePath: './commands/skill.js',
    subcommands: [
      { usage: 'add [options] <registry-repo> [skill-name]', description: 'Install a skill from a registry' },
      { usage: 'list', description: 'List all installed skills in the current project' },
      { usage: 'remove <skill-name>', description: 'Remove a skill from the current project' },
      { usage: 'update [registry-id]', description: 'Update skills from registries' },
      { usage: 'find [options] <keyword>', description: 'Search for skills across all registries' },
      { usage: 'rebuild-index [options]', description: 'Rebuild the skill index from all registries' },
    ],
  },
  {
    name: 'agent',
    usage: 'agent [options] [command]',
    description: 'Manage AI Agents',
    modulePath: './commands/agent.js',
    subcommands: [
      { usage: 'start [options]', description: 'Start a new agent in a managed tmux session' },
      { usage: 'list [options]', description: 'List all running AI agents' },
      { usage: 'sessions [options]', description: 'List historical Claude/Codex/Gemini/OpenCode sessions for resume' },
      { usage: 'session', description: 'Manage historical AI agent sessions' },
      { usage: 'open <name>', description: 'Focus a running agent terminal' },
      { usage: 'send [options] [message]', description: 'Send a message to a running agent' },
      { usage: 'kill <name>', description: 'Stop a running agent and clean up its managed tmux session' },
      { usage: 'detail [options]', description: 'Show detailed information about a running agent' },
      { usage: 'rename <current-name> <new-name>', description: 'Rename an agent in the registry' },
      { usage: 'console', description: 'Interactive multi-agent console' },
    ],
  },
  {
    name: 'channel',
    usage: 'channel [options] [command]',
    description: 'Connect agents with messaging channels',
    modulePath: './commands/channel.js',
    subcommands: [
      { usage: 'connect [options] <type>', description: 'Connect a messaging channel' },
      { usage: 'list', description: 'List configured channels' },
      { usage: 'disconnect <name>', description: 'Remove a channel configuration' },
      { usage: 'start [options] [name]', description: 'Start the channel bridge to a running agent' },
      { usage: 'stop [name]', description: 'Stop a running channel bridge' },
      { usage: 'status [name]', description: 'Show channel bridge status' },
    ],
  },
  {
    name: 'docs',
    usage: 'docs [options] [command]',
    description: 'Manage AI DevKit documentation',
    modulePath: './commands/docs.js',
    subcommands: [
      { usage: 'init-feature [options] <name>', description: 'Initialize date-prefixed feature documentation from phase templates' },
    ],
  },
];

export function getCliCommand(name: string | undefined): CliCommandManifest | undefined {
  return CLI_COMMANDS.find((command) => command.name === name);
}
