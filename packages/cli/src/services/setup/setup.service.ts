import { execFile } from 'child_process';
import fs from 'fs-extra';
import { homedir } from 'os';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { promisify } from 'util';
import { BUILTIN_SKILL_NAMES, BUILTIN_SKILL_REGISTRY } from '../../constants.js';
import { ConfigManager } from '../../lib/Config.js';
import { SkillManager } from '../../lib/SkillManager.js';
import { getErrorMessage } from '../../util/text.js';

const execFileAsync = promisify(execFile);
const CODEX_HOOK_COMMAND = 'node ~/.codex/hooks/codex-session-mapping.cjs';
const PI_TRACKER_PACKAGE = 'npm:@ai-devkit/pi-session-tracker';
const CLAUDE_PROMPT_HOOK_COMMAND = 'node ~/.claude/hooks/claude-prompt-hook.js';

export const SUPPORTED_SETUP_AGENTS = ['codex', 'pi', 'claude'] as const;

export type SetupAgent = typeof SUPPORTED_SETUP_AGENTS[number];
export type SetupStepStatus = 'installed' | 'skipped' | 'failed';

export interface SetupStepResult {
  agent: SetupAgent;
  step: string;
  status: SetupStepStatus;
  message: string;
}

export interface SetupReport {
  results: SetupStepResult[];
}

export interface SetupRunOptions {
  agents?: SetupAgent[];
}

type CommandRunner = (command: string, args: string[]) => Promise<void>;
type BuiltInSkillInstaller = (agent: SetupAgent) => Promise<void>;

interface SetupServiceDeps {
  homeDir?: string;
  assetRoot?: string;
  runCommand?: CommandRunner;
  installBuiltInSkills?: BuiltInSkillInstaller;
}

interface SetupStepContext {
  homeDir: string;
  assetRoot: string;
  runCommand: CommandRunner;
  installBuiltInSkills: BuiltInSkillInstaller;
}

interface AgentSetupStep {
  name: string;
  run(context: SetupStepContext, agent: SetupAgent): Promise<SetupStepResult>;
}

interface AgentSetupDefinition {
  agent: SetupAgent;
  dotFolder: string;
  steps: AgentSetupStep[];
}

interface CodexCommandHook {
  type?: string;
  command?: string;
  timeout?: number;
  [key: string]: unknown;
}

interface CodexSessionStartEntry {
  matcher?: string;
  hooks?: CodexCommandHook[];
  [key: string]: unknown;
}

interface CodexHooksJson {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface SetupService {
  run(options?: SetupRunOptions): Promise<SetupReport>;
}

export function createSetupService(deps: SetupServiceDeps = {}): SetupService {
  const context: SetupStepContext = {
    homeDir: deps.homeDir ?? homedir(),
    assetRoot: deps.assetRoot ?? resolveDefaultAssetRoot(),
    runCommand: deps.runCommand ?? defaultRunCommand,
    installBuiltInSkills: deps.installBuiltInSkills ?? defaultInstallBuiltInSkills,
  };

  return {
    async run(options: SetupRunOptions = {}): Promise<SetupReport> {
      const agents = options.agents ?? setupDefinitions.map(definition => definition.agent);
      const selectedDefinitions = setupDefinitions.filter(definition => agents.includes(definition.agent));
      const results: SetupStepResult[] = [];

      for (const definition of selectedDefinitions) {
        if (!(await fs.pathExists(join(context.homeDir, definition.dotFolder)))) {
          results.push(skipped(
            definition.agent,
            'setup',
            `~/${definition.dotFolder} does not exist.`,
          ));
          continue;
        }

        for (const step of definition.steps) {
          try {
            results.push(await step.run(context, definition.agent));
          } catch (error) {
            results.push(failed(definition.agent, step.name, getErrorMessage(error)));
          }
        }
      }

      return { results };
    },
  };
}

function resolveDefaultAssetRoot(): string {
  const serviceDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(serviceDir, '../../assets'),
    resolve(serviceDir, '../../../assets'),
  ];

  return candidates.find(candidate => fs.pathExistsSync(candidate)) ?? candidates[0];
}

const setupDefinitions: AgentSetupDefinition[] = [
  {
    agent: 'codex',
    dotFolder: '.codex',
    steps: [
      { name: 'codex-session-hook', run: setupCodexSessionHook },
      { name: 'built-in-skills', run: setupBuiltInSkills },
    ],
  },
  {
    agent: 'pi',
    dotFolder: '.pi',
    steps: [
      { name: 'pi-session-tracker', run: setupPiSessionTracker },
      { name: 'built-in-skills', run: setupBuiltInSkills },
    ],
  },
  {
    agent: 'claude',
    dotFolder: '.claude',
    steps: [
      { name: 'claude-prompt-hook', run: setupClaudePromptHook },
      { name: 'built-in-skills', run: setupBuiltInSkills },
    ],
  },
];

async function setupCodexSessionHook(context: SetupStepContext): Promise<SetupStepResult> {
  const codexDir = join(context.homeDir, '.codex');

  const hooksDir = join(codexDir, 'hooks');
  await fs.ensureDir(hooksDir);
  await fs.copyFile(
    join(context.assetRoot, 'codex', 'codex-session-mapping.cjs'),
    join(hooksDir, 'codex-session-mapping.cjs'),
  );

  const hooksJsonPath = join(codexDir, 'hooks.json');
  const sourceHooks = await fs.readJson(join(context.assetRoot, 'codex', 'hooks.json')) as CodexHooksJson;
  const sessionStartEntry = getSessionStartEntries(sourceHooks)[0];

  if (!sessionStartEntry) {
    throw new Error('Codex hook asset does not include a SessionStart entry.');
  }

  const existingHooks = await readHooksJson(hooksJsonPath);
  const hooks = ensureHooksObject(existingHooks);
  const sessionStart = getSessionStartEntries(existingHooks);

  const alreadyConfigured = sessionStart.some((entry) =>
    Array.isArray(entry?.hooks)
    && entry.hooks.some((hook) => hook.type === 'command' && hook.command === CODEX_HOOK_COMMAND)
  );

  if (alreadyConfigured) {
    await fs.writeJson(hooksJsonPath, existingHooks, { spaces: 2 });
    return skipped('codex', 'codex-session-hook', 'Codex SessionStart hook already configured.');
  }

  hooks.SessionStart = [...sessionStart, sessionStartEntry];
  await fs.writeJson(hooksJsonPath, existingHooks, { spaces: 2 });

  return installed('codex', 'codex-session-hook', 'Installed Codex SessionStart hook.');
}

async function setupPiSessionTracker(context: SetupStepContext): Promise<SetupStepResult> {
  await context.runCommand('pi', ['install', PI_TRACKER_PACKAGE]);
  return installed('pi', 'pi-session-tracker', 'Installed Pi session tracker plugin.');
}

interface ClaudeSettingsJson {
  hooks?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ClaudeHookEntry {
  matcher?: string;
  hooks?: Array<{ type?: string; command?: string; timeout?: number }>;
  [key: string]: unknown;
}

async function setupClaudePromptHook(context: SetupStepContext): Promise<SetupStepResult> {
  const claudeDir = join(context.homeDir, '.claude');
  const hooksDir = join(claudeDir, 'hooks');
  await fs.ensureDir(hooksDir);

  await fs.copyFile(
    join(context.assetRoot, 'claude', 'claude-prompt-hook.js'),
    join(hooksDir, 'claude-prompt-hook.js'),
  );

  const newEntry = await fs.readJson(
    join(context.assetRoot, 'claude', 'settings-hook.json'),
  ) as ClaudeHookEntry;

  const settingsPath = join(claudeDir, 'settings.json');
  let settings: ClaudeSettingsJson = {};
  try {
    settings = await fs.readJson(settingsPath) as ClaudeSettingsJson;
  } catch {
    settings = {};
  }

  if (!isRecord(settings.hooks)) {
    settings.hooks = {};
  }
  const hooksRecord = settings.hooks as Record<string, unknown>;
  const existingEntries: ClaudeHookEntry[] = Array.isArray(hooksRecord.PreToolUse)
    ? hooksRecord.PreToolUse as ClaudeHookEntry[]
    : [];

  const alreadyConfigured = existingEntries.some((entry) =>
    Array.isArray(entry?.hooks) &&
    entry.hooks.some((h) => h.command === CLAUDE_PROMPT_HOOK_COMMAND),
  );

  if (alreadyConfigured) {
    await fs.writeJson(settingsPath, settings, { spaces: 2 });
    return skipped('claude', 'claude-prompt-hook', 'Claude PreToolUse hook already configured.');
  }

  hooksRecord.PreToolUse = [...existingEntries, newEntry];
  await fs.writeJson(settingsPath, settings, { spaces: 2 });

  return installed('claude', 'claude-prompt-hook', 'Installed Claude PreToolUse prompt hook.');
}

async function setupBuiltInSkills(
  context: SetupStepContext,
  agent: SetupAgent,
): Promise<SetupStepResult> {
  await context.installBuiltInSkills(agent);
  return installed(agent, 'built-in-skills', `Installed AI DevKit built-in skills for ${agent}.`);
}

async function readHooksJson(hooksJsonPath: string): Promise<CodexHooksJson> {
  if (!(await fs.pathExists(hooksJsonPath))) {
    return { hooks: {} };
  }

  return fs.readJson(hooksJsonPath) as Promise<CodexHooksJson>;
}

function ensureHooksObject(hooksJson: CodexHooksJson): Record<string, unknown> {
  if (!isRecord(hooksJson.hooks)) {
    hooksJson.hooks = {};
  }

  return hooksJson.hooks;
}

function getSessionStartEntries(hooksJson: CodexHooksJson): CodexSessionStartEntry[] {
  const hooks = isRecord(hooksJson.hooks) ? hooksJson.hooks : {};
  const sessionStart = hooks.SessionStart;

  return Array.isArray(sessionStart)
    ? sessionStart.filter(isSessionStartEntry)
    : [];
}

function isSessionStartEntry(value: unknown): value is CodexSessionStartEntry {
  if (!isRecord(value)) {
    return false;
  }

  return value.hooks === undefined || Array.isArray(value.hooks);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function defaultRunCommand(command: string, args: string[]): Promise<void> {
  await execFileAsync(command, args);
}

async function defaultInstallBuiltInSkills(agent: SetupAgent): Promise<void> {
  const skillManager = new SkillManager(new ConfigManager());

  for (const builtInSkill of BUILTIN_SKILL_NAMES) {
    await skillManager.addSkill(BUILTIN_SKILL_REGISTRY, builtInSkill, {
      global: true,
      environments: [agent],
    });
  }
}

function installed(agent: SetupAgent, step: string, message: string): SetupStepResult {
  return { agent, step, status: 'installed', message };
}

function skipped(agent: SetupAgent, step: string, message: string): SetupStepResult {
  return { agent, step, status: 'skipped', message };
}

function failed(agent: SetupAgent, step: string, message: string): SetupStepResult {
  return { agent, step, status: 'failed', message };
}
