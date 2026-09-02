import { constants, existsSync } from 'node:fs';
import { access as fsAccess, readFile as fsReadFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import {
  getAgentReadinessReports,
  getCodexCapacityReport,
  worstReadinessStatus,
  type AgentReadinessOptions,
  type AgentReadinessReport,
  type ReadinessAgentType,
  type ReadinessStatus,
} from '@ai-devkit/agent-manager';
import { BUILTIN_SKILL_NAMES } from '../../constants.js';
import { filterStringRecord } from '../../util/config.js';
import { getGlobalSkillPath, isValidEnvironmentCode } from '../../util/env.js';
import { inspectTmux } from '../../util/tmux.js';
import packageJson from '../../../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);

export type CheckStatus = ReadinessStatus;
type CommandResult = { stdout: string; stderr: string };
type ReadFile = (target: string) => Promise<string>;
type Access = (target: string, mode?: number) => Promise<void>;
type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

interface CheckBase { status: CheckStatus; errors: string[] }
interface InfoBase { errors: string[] }
interface ProjectConfigCheck extends CheckBase {
  path: string;
  present: boolean;
  valid: boolean;
  version: string | null;
  environments: string[];
}
interface RegistryScopeCheck extends InfoBase {
  source: string;
  configured: Record<string, string>;
}
interface RegistriesCheck {
  project: RegistryScopeCheck;
  global: RegistryScopeCheck;
}
interface VersionCheck extends CheckBase {
  installedVersion: string;
  latestVersion: string | null;
  updateAvailable: boolean | null;
  latestVersionSource: 'npm';
}
interface TmuxCheck extends CheckBase {
  path: string | null;
  available: boolean;
  version: string | null;
}
interface ChannelConnection extends InfoBase {
  name: string;
  type: string;
  enabled: boolean;
  credentialsPresent: boolean;
  authorized: boolean | null;
  ready: boolean;
}
interface ChannelConfigCheck extends InfoBase {
  path: string;
  present: boolean;
  validJson: boolean;
  validSchema: boolean;
}
interface ChannelsCheck {
  config: ChannelConfigCheck;
  connections: ChannelConnection[];
  readyCount: number;
}

export interface StatusReport {
  generatedAt: string;
  overall: CheckStatus;
  aiDevkit: VersionCheck;
  project: { cwd: string; config: ProjectConfigCheck };
  agents: Record<ReadinessAgentType, AgentReadinessReport>;
  tmux: TmuxCheck;
  registries: RegistriesCheck;
  channels: ChannelsCheck;
  checks: { passed: number; warnings: number; failed: number };
}

export interface StatusServiceOptions {
  cwd?: string;
  homeDir?: string;
  path?: string;
  assetRoot?: string;
  installedVersion?: string;
  now?: () => Date;
  readFile?: ReadFile;
  access?: Access;
  runCommand?: RunCommand;
  codexAuth?: () => Promise<boolean | null>;
}

type Runtime = Required<StatusServiceOptions>;

const STATUS_SKILL_ROOTS: Record<ReadinessAgentType, string> = {
  claude: getGlobalSkillPath('claude') ?? '.claude/skills',
  codex: getGlobalSkillPath('codex') ?? '.codex/skills',
  copilot: getGlobalSkillPath('github') ?? '.copilot/skills',
  grok_cli: getGlobalSkillPath('grok') ?? '.grok/skills',
  opencode: getGlobalSkillPath('opencode') ?? '.config/opencode/skills',
  pi: getGlobalSkillPath('pi') ?? '.pi/agent/skills',
};

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  return worstReadinessStatus(statuses);
}

function displayHome(target: string, homeDir: string): string {
  return target === homeDir ? '~' : target.startsWith(`${homeDir}/`) ? `~${target.slice(homeDir.length)}` : target;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}

async function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
  const result = await execFileAsync(command, args, {
    encoding: 'utf8', timeout: 5000, maxBuffer: 1024 * 1024,
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

function resolveDefaultAssetRoot(): string {
  const serviceDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [resolve(serviceDir, '../../assets'), resolve(serviceDir, '../../../assets')];
  return candidates.find(candidate => existsSync(candidate)) ?? candidates[0];
}

function runtime(options: StatusServiceOptions): Runtime {
  return {
    cwd: resolve(options.cwd ?? process.cwd()),
    homeDir: options.homeDir ?? process.env.HOME ?? '',
    path: options.path ?? process.env.PATH ?? '',
    assetRoot: options.assetRoot ?? resolveDefaultAssetRoot(),
    installedVersion: options.installedVersion ?? packageJson.version,
    now: options.now ?? (() => new Date()),
    readFile: options.readFile ?? (target => fsReadFile(target, 'utf8')),
    access: options.access ?? ((target, mode = constants.R_OK) => fsAccess(target, mode)),
    runCommand: options.runCommand ?? defaultRunCommand,
    codexAuth: options.codexAuth ?? (async () => (await getCodexCapacityReport()).authenticated),
  };
}

async function projectConfigCheck(rt: Runtime): Promise<{ check: ProjectConfigCheck; raw: Record<string, unknown> | null }> {
  const target = join(rt.cwd, '.ai-devkit.json');
  let text: string;
  try { text = await rt.readFile(target); } catch {
    return { raw: null, check: {
      path: target, present: false, valid: false, version: null, environments: [],
      status: 'warn', errors: ['project configuration is missing'],
    } };
  }
  let parsed: Record<string, unknown> | null = null;
  try { parsed = record(JSON.parse(text)); } catch { /* safe error below */ }
  if (!parsed) return { raw: null, check: {
    path: target, present: true, valid: false, version: null, environments: [],
    status: 'fail', errors: ['project configuration is invalid JSON or not an object'],
  } };
  const version = typeof parsed.version === 'string' ? parsed.version : null;
  const environments = Array.isArray(parsed.environments)
    ? parsed.environments.filter((value): value is string => typeof value === 'string') : [];
  const invalidEnvironments = environments.filter(value => !isValidEnvironmentCode(value));
  const valid = version !== null && Array.isArray(parsed.environments)
    && environments.length === parsed.environments.length && invalidEnvironments.length === 0;
  return { raw: parsed, check: {
    path: target, present: true, valid, version, environments,
    status: valid ? 'pass' : 'fail', errors: valid ? [] : ['project configuration has invalid fields or environment codes'],
  } };
}

async function globalRegistries(rt: Runtime): Promise<RegistryScopeCheck> {
  const source = join(rt.homeDir, '.ai-devkit', '.ai-devkit.json');
  try {
    const parsed = record(JSON.parse(await rt.readFile(source)));
    if (!parsed) throw new Error('invalid');
    return { source: displayHome(source, rt.homeDir), configured: safeRegistries(parsed.registries), errors: [] };
  } catch {
    return {
      source: displayHome(source, rt.homeDir), configured: {},
      errors: ['global AI DevKit configuration is missing or invalid'],
    };
  }
}

function projectRegistries(raw: Record<string, unknown> | null, source: string): RegistryScopeCheck {
  return raw
    ? { source, configured: safeRegistries(raw.registries), errors: [] }
    : { source, configured: {}, errors: ['project registries are unavailable because project configuration is invalid'] };
}

function safeRegistries(raw: unknown): Record<string, string> {
  return Object.fromEntries(Object.entries(filterStringRecord(raw)).map(([id, value]) => {
    try {
      const url = new URL(value);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return [id, url.toString()];
    } catch {
      return [id, /^[\w.-]+@[\w.-]+:[^\s]+$/.test(value) ? value : '[redacted registry URL]'];
    }
  }));
}

function versionParts(value: string): number[] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value.trim());
  return match ? match.slice(1).map(Number) : null;
}

function isNewer(latest: string, installed: string): boolean | null {
  const left = versionParts(latest);
  const right = versionParts(installed);
  if (!left || !right) return null;
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] > right[index];
  }
  return false;
}

async function versionCheck(rt: Runtime): Promise<VersionCheck> {
  try {
    const result = await rt.runCommand('npm', ['view', 'ai-devkit', 'version']);
    const latestVersion = result.stdout.trim();
    const updateAvailable = isNewer(latestVersion, rt.installedVersion);
    if (updateAvailable === null) throw new Error('invalid');
    return {
      installedVersion: rt.installedVersion, latestVersion, updateAvailable,
      latestVersionSource: 'npm', status: 'pass', errors: [],
    };
  } catch {
    return {
      installedVersion: rt.installedVersion, latestVersion: null, updateAvailable: null,
      latestVersionSource: 'npm', status: 'warn', errors: ['latest npm version is unavailable'],
    };
  }
}

async function tmuxCheck(rt: Runtime): Promise<TmuxCheck> {
  const inspection = await inspectTmux({
    run: (command, args) => rt.runCommand(command, [...args]),
    platform: process.platform,
    readOsRelease: async () => '',
    releaseText: '',
    which: async () => false,
  });
  if (inspection.state === 'available') {
    return { path: 'tmux', available: true, version: inspection.version, status: 'pass', errors: [] };
  }
  if (inspection.state === 'missing') {
    return {
      path: null, available: false, version: null, status: 'fail', errors: ['tmux was not found on PATH'],
    };
  }
  return {
    path: 'tmux', available: false, version: null, status: 'fail', errors: ['tmux version probe failed'],
  };
}

function nonEmpty(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function channelConnection(name: string, value: unknown): ChannelConnection {
  const entry = record(value);
  const type = typeof entry?.type === 'string' ? entry.type : 'unknown';
  const enabled = entry?.enabled === true;
  const config = record(entry?.config);
  let credentialsPresent = false;
  let authorized: boolean | null = null;
  let schemaValid = Boolean(entry && config && typeof entry.enabled === 'boolean');
  if (type === 'telegram') {
    credentialsPresent = nonEmpty(config?.botToken) && nonEmpty(config?.botUsername);
    authorized = typeof config?.authorizedChatId === 'number';
    schemaValid = schemaValid && credentialsPresent;
  } else if (type === 'slack') {
    credentialsPresent = typeof config?.appToken === 'string' && config.appToken.startsWith('xapp-')
      && typeof config?.botToken === 'string' && config.botToken.startsWith('xoxb-');
    authorized = null;
    schemaValid = schemaValid && credentialsPresent && nonEmpty(config?.botUserId) && nonEmpty(config?.workspaceId)
      && config?.transport === 'socket-mode' && config?.audience === 'dm';
  } else {
    schemaValid = false;
  }
  const ready = enabled && schemaValid && (authorized !== false);
  return {
    name, type, enabled, credentialsPresent, authorized, ready,
    errors: ready ? [] : [enabled ? 'channel configuration is not ready' : 'channel is disabled'],
  };
}

async function channelsCheck(rt: Runtime): Promise<ChannelsCheck> {
  const target = join(rt.homeDir, '.ai-devkit', 'channels.json');
  let text: string;
  try { text = await rt.readFile(target); } catch {
    const config: ChannelConfigCheck = {
      path: displayHome(target, rt.homeDir), present: false, validJson: false, validSchema: false,
      errors: ['channel configuration has not been created'],
    };
    return { config, connections: [], readyCount: 0 };
  }
  let parsed: Record<string, unknown> | null = null;
  try { parsed = record(JSON.parse(text)); } catch { /* fixed safe error below */ }
  const channelRecord = record(parsed?.channels);
  if (!parsed || !channelRecord) {
    const config: ChannelConfigCheck = {
      path: displayHome(target, rt.homeDir), present: true, validJson: parsed !== null,
      validSchema: false, errors: ['channel configuration is invalid'],
    };
    return { config, connections: [], readyCount: 0 };
  }
  const connections = Object.entries(channelRecord).map(([name, entry]) => channelConnection(name, entry));
  const validSchema = connections.every(item => item.ready || !item.enabled);
  const config: ChannelConfigCheck = {
    path: displayHome(target, rt.homeDir), present: true, validJson: true, validSchema: true,
    errors: validSchema ? [] : ['one or more channel entries are invalid'],
  };
  config.validSchema = validSchema;
  return {
    config, connections, readyCount: connections.filter(item => item.ready).length,
  };
}

function leafStatuses(report: Omit<StatusReport, 'overall' | 'checks'>): CheckStatus[] {
  const agentStatuses = Object.values(report.agents)
    .filter(agent => agent.executable.path !== null)
    .flatMap(agent => [
    agent.executable.status,
    agent.globalConfig.status,
    ...(agent.auth ? [agent.auth.status] : []),
    ...(agent.integration ? [agent.integration.status] : []),
  ]);
  return [report.aiDevkit.status, report.project.config.status, ...agentStatuses, report.tmux.status];
}

export async function getStatusReport(options: StatusServiceOptions = {}): Promise<StatusReport> {
  const rt = runtime(options);
  const projectPromise = projectConfigCheck(rt);
  const agentOptions: AgentReadinessOptions = {
    homeDir: rt.homeDir,
    path: rt.path,
    assetRoot: rt.assetRoot,
    builtInSkillNames: BUILTIN_SKILL_NAMES,
    skillRoots: STATUS_SKILL_ROOTS,
    readFile: rt.readFile,
    access: rt.access,
    runCommand: rt.runCommand,
    codexAuth: rt.codexAuth,
  };
  const [project, agents, aiDevkit, tmux, globalRegistry, channels] = await Promise.all([
    projectPromise,
    getAgentReadinessReports(agentOptions),
    versionCheck(rt), tmuxCheck(rt), globalRegistries(rt), channelsCheck(rt),
  ]);
  const registries: RegistriesCheck = {
    project: projectRegistries(project.raw, project.check.path), global: globalRegistry,
  };
  const partial = {
    generatedAt: rt.now().toISOString(), aiDevkit,
    project: { cwd: rt.cwd, config: project.check }, agents,
    tmux, registries, channels,
  };
  const statuses = leafStatuses(partial);
  return {
    ...partial, overall: worstStatus(statuses),
    checks: {
      passed: statuses.filter(status => status === 'pass').length,
      warnings: statuses.filter(status => status === 'warn').length,
      failed: statuses.filter(status => status === 'fail').length,
    },
  };
}
