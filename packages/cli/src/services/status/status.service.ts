import { constants, existsSync } from 'node:fs';
import { access as fsAccess, readFile as fsReadFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { dirname, delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { AGENTS, getCodexCapacityReport } from '@ai-devkit/agent-manager';
import { BUILTIN_SKILL_NAMES } from '../../constants.js';
import { filterStringRecord } from '../../util/config.js';
import { getGlobalSkillPath, isValidEnvironmentCode } from '../../util/env.js';
import packageJson from '../../../package.json' with { type: 'json' };

const execFileAsync = promisify(execFile);

export type CheckStatus = 'pass' | 'warn' | 'fail';
export type AuthState = 'authenticated' | 'unauthenticated' | 'unknown';
type AgentKey = 'codex' | 'pi' | 'claude';
type CommandResult = { stdout: string; stderr: string };
type ReadFile = (target: string) => Promise<string>;
type Access = (target: string, mode?: number) => Promise<void>;
type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

interface CheckBase { status: CheckStatus; errors: string[] }
interface ExecutableCheck extends CheckBase { command: string; path: string | null }
interface DirectoryCheck extends CheckBase { path: string; present: boolean; readable: boolean }
interface AuthCheck extends CheckBase { state: AuthState; source: string }
interface SkillsCheck extends CheckBase {
  path: string;
  required: number;
  present: number;
  missing: string[];
}
interface ScriptCheck extends CheckBase {
  path: string;
  present: boolean;
  readable: boolean;
  matchesBundledAsset: boolean;
}
interface RegistrationCheck extends CheckBase {
  path: string;
  event: string;
  command: string;
  present: boolean;
  valid: boolean;
}
interface MappingCheck extends CheckBase {
  path: string;
  present: boolean;
  valid: boolean;
  invalidEntries: number;
  staleEntries: number;
}
interface TrackerCheck extends CheckBase {
  package: string;
  installed: boolean;
  registryPath: string;
  registryValid: boolean;
  invalidEntries: number;
  staleEntries: number;
}
interface HookGroupBase { status: CheckStatus }
interface CodexHooks extends HookGroupBase {
  sessionMappingScript: ScriptCheck;
  registration: RegistrationCheck;
  mappingFile: MappingCheck;
}
interface ClaudeHooks extends HookGroupBase {
  promptScript: ScriptCheck;
  registration: RegistrationCheck;
}
interface PiHooks extends HookGroupBase { sessionTracker: TrackerCheck }
interface AgentCheck<H extends HookGroupBase> {
  executable: ExecutableCheck;
  globalConfig: DirectoryCheck;
  auth: AuthCheck;
  builtInSkills: SkillsCheck;
  hooks: H;
  status: CheckStatus;
}
interface ProjectConfigCheck extends CheckBase {
  path: string;
  present: boolean;
  valid: boolean;
  version: string | null;
  environments: string[];
}
interface RegistryScopeCheck extends CheckBase {
  source: string;
  configured: Record<string, string>;
}
interface RegistriesCheck {
  project: RegistryScopeCheck;
  global: RegistryScopeCheck;
  status: CheckStatus;
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
interface ChannelConnection extends CheckBase {
  name: string;
  type: string;
  enabled: boolean;
  credentialsPresent: boolean;
  authorized: boolean | null;
  ready: boolean;
}
interface ChannelConfigCheck extends CheckBase {
  path: string;
  present: boolean;
  validJson: boolean;
  validSchema: boolean;
}
interface ChannelsCheck {
  config: ChannelConfigCheck;
  connections: ChannelConnection[];
  readyCount: number;
  status: CheckStatus;
}

export interface StatusReport {
  generatedAt: string;
  overall: CheckStatus;
  aiDevkit: VersionCheck;
  project: { cwd: string; config: ProjectConfigCheck };
  agents: {
    codex: AgentCheck<CodexHooks>;
    pi: AgentCheck<PiHooks>;
    claude: AgentCheck<ClaudeHooks>;
  };
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

const AGENT_META: Record<AgentKey, { dotDir: string; skillEnv: 'codex' | 'pi' | 'claude' }> = {
  codex: { dotDir: '.codex', skillEnv: 'codex' },
  pi: { dotDir: '.pi', skillEnv: 'pi' },
  claude: { dotDir: '.claude', skillEnv: 'claude' },
};

function statusRank(status: CheckStatus): number {
  return status === 'fail' ? 2 : status === 'warn' ? 1 : 0;
}

export function worstStatus(statuses: CheckStatus[]): CheckStatus {
  return statuses.reduce<CheckStatus>((worst, current) =>
    statusRank(current) > statusRank(worst) ? current : worst, 'pass');
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

async function accessible(target: string, rt: Runtime, mode = constants.R_OK): Promise<boolean> {
  try { await rt.access(target, mode); return true; } catch { return false; }
}

async function resolveExecutable(command: string, rt: Runtime): Promise<string | null> {
  for (const directory of rt.path.split(delimiter).filter(Boolean)) {
    const target = join(directory, command);
    if (await accessible(target, rt, constants.X_OK)) return target;
  }
  return null;
}

async function executableCheck(command: string, rt: Runtime): Promise<ExecutableCheck> {
  const resolvedPath = await resolveExecutable(command, rt);
  return {
    command, path: resolvedPath, status: resolvedPath ? 'pass' : 'fail',
    errors: resolvedPath ? [] : [`${command} was not found on PATH`],
  };
}

async function directoryCheck(agent: AgentKey, rt: Runtime): Promise<DirectoryCheck> {
  const target = join(rt.homeDir, AGENT_META[agent].dotDir);
  const readable = await accessible(target, rt);
  return {
    path: displayHome(target, rt.homeDir), present: readable, readable,
    status: readable ? 'pass' : 'fail', errors: readable ? [] : ['global configuration directory is unavailable'],
  };
}

async function builtInSkillsCheck(agent: AgentKey, rt: Runtime): Promise<SkillsCheck> {
  const relativeRoot = getGlobalSkillPath(AGENT_META[agent].skillEnv) ?? '';
  const root = join(rt.homeDir, relativeRoot);
  const present: string[] = [];
  for (const name of BUILTIN_SKILL_NAMES) {
    if (await accessible(join(root, name, 'SKILL.md'), rt)) present.push(name);
  }
  const missing = BUILTIN_SKILL_NAMES.filter(name => !present.includes(name));
  return {
    path: displayHome(root, rt.homeDir), required: BUILTIN_SKILL_NAMES.length,
    present: present.length, missing: [...missing], status: missing.length ? 'fail' : 'pass',
    errors: missing.length ? ['required built-in skills are missing'] : [],
  };
}

async function scriptCheck(installed: string, bundled: string, rt: Runtime): Promise<ScriptCheck> {
  let installedText: string;
  try { installedText = await rt.readFile(installed); } catch {
    return {
      path: displayHome(installed, rt.homeDir), present: false, readable: false,
      matchesBundledAsset: false, status: 'fail', errors: ['hook script is unavailable'],
    };
  }
  try {
    const bundledText = await rt.readFile(bundled);
    const matches = installedText === bundledText;
    return {
      path: displayHome(installed, rt.homeDir), present: true, readable: true,
      matchesBundledAsset: matches, status: matches ? 'pass' : 'fail',
      errors: matches ? [] : ['hook script differs from the bundled AI DevKit asset'],
    };
  } catch {
    return {
      path: displayHome(installed, rt.homeDir), present: true, readable: true,
      matchesBundledAsset: false, status: 'fail', errors: ['bundled hook asset is unavailable'],
    };
  }
}

function containsHook(root: unknown, event: string, command: string): boolean {
  const hooks = record(record(root)?.hooks);
  const entries = hooks?.[event];
  if (!Array.isArray(entries)) return false;
  return entries.some(entry => {
    const commands = record(entry)?.hooks;
    return Array.isArray(commands) && commands.some(hook => {
      const item = record(hook);
      return item?.type === 'command' && item.command === command;
    });
  });
}

async function registrationCheck(
  target: string, event: string, command: string, rt: Runtime,
): Promise<RegistrationCheck> {
  try {
    const parsed = JSON.parse(await rt.readFile(target));
    const valid = containsHook(parsed, event, command);
    return {
      path: displayHome(target, rt.homeDir), event, command, present: true, valid,
      status: valid ? 'pass' : 'fail', errors: valid ? [] : ['required hook registration is missing'],
    };
  } catch {
    return {
      path: displayHome(target, rt.homeDir), event, command, present: false, valid: false,
      status: 'fail', errors: ['hook configuration is missing or invalid'],
    };
  }
}

async function mappingCheck(target: string, rt: Runtime): Promise<MappingCheck> {
  let text: string;
  try { text = await rt.readFile(target); } catch {
    return {
      path: displayHome(target, rt.homeDir), present: false, valid: false,
      invalidEntries: 0, staleEntries: 0, status: 'warn', errors: ['session mapping has not been created'],
    };
  }
  let parsed: Record<string, unknown> | null = null;
  try { parsed = record(JSON.parse(text)); } catch { /* fixed safe error below */ }
  if (!parsed) {
    return {
      path: displayHome(target, rt.homeDir), present: true, valid: false,
      invalidEntries: 0, staleEntries: 0, status: 'fail', errors: ['session mapping is invalid'],
    };
  }
  let invalidEntries = 0;
  let staleEntries = 0;
  for (const [pid, sessionPath] of Object.entries(parsed)) {
    if (!/^\d+$/.test(pid) || typeof sessionPath !== 'string' || !sessionPath) {
      invalidEntries += 1;
      continue;
    }
    if (!await accessible(sessionPath, rt)) staleEntries += 1;
  }
  const valid = invalidEntries === 0;
  return {
    path: displayHome(target, rt.homeDir), present: true, valid, invalidEntries, staleEntries,
    status: !valid ? 'fail' : staleEntries ? 'warn' : 'pass',
    errors: !valid ? ['session mapping contains invalid entries'] : staleEntries ? ['session mapping contains stale entries'] : [],
  };
}

async function codexHooks(rt: Runtime): Promise<CodexHooks> {
  const script = await scriptCheck(
    join(rt.homeDir, '.codex', 'hooks', 'codex-session-mapping.cjs'),
    join(rt.assetRoot, 'codex', 'codex-session-mapping.cjs'), rt,
  );
  const registration = await registrationCheck(
    join(rt.homeDir, '.codex', 'hooks.json'), 'SessionStart',
    'node ~/.codex/hooks/codex-session-mapping.cjs', rt,
  );
  const mappingFile = await mappingCheck(join(rt.homeDir, '.codex', 'ai-devkit', 'sessions.json'), rt);
  return { sessionMappingScript: script, registration, mappingFile, status: worstStatus([script.status, registration.status, mappingFile.status]) };
}

async function claudeHooks(rt: Runtime): Promise<ClaudeHooks> {
  const script = await scriptCheck(
    join(rt.homeDir, '.claude', 'hooks', 'claude-prompt-hook.js'),
    join(rt.assetRoot, 'claude', 'claude-prompt-hook.js'), rt,
  );
  const registration = await registrationCheck(
    join(rt.homeDir, '.claude', 'settings.json'), 'PreToolUse',
    'node ~/.claude/hooks/claude-prompt-hook.js', rt,
  );
  return { promptScript: script, registration, status: worstStatus([script.status, registration.status]) };
}

async function piHooks(rt: Runtime): Promise<PiHooks> {
  let installed = false;
  try {
    const result = await rt.runCommand('pi', ['list']);
    installed = result.stdout.includes('@ai-devkit/pi-session-tracker');
  } catch { /* safe fixed result */ }
  const mapping = await mappingCheck(join(rt.homeDir, '.pi', 'agent', 'sessions.json'), rt);
  const status = worstStatus([installed ? 'pass' : 'fail', mapping.status]);
  return { sessionTracker: {
    package: '@ai-devkit/pi-session-tracker', installed,
    registryPath: mapping.path, registryValid: mapping.valid,
    invalidEntries: mapping.invalidEntries, staleEntries: mapping.staleEntries,
    status, errors: [
      ...(!installed ? ['Pi session tracker is not registered'] : []), ...mapping.errors,
    ],
  }, status };
}

async function codexAuthCheck(rt: Runtime): Promise<AuthCheck> {
  try {
    const value = await rt.codexAuth();
    return {
      state: value === true ? 'authenticated' : value === false ? 'unauthenticated' : 'unknown',
      source: displayHome(join(rt.homeDir, '.codex', 'auth.json'), rt.homeDir),
      status: value === true ? 'pass' : value === false ? 'fail' : 'warn',
      errors: value === true ? [] : [value === false ? 'Codex is not authenticated' : 'Codex authentication is unknown'],
    };
  } catch {
    return { state: 'unknown', source: '~/.codex/auth.json', status: 'warn', errors: ['Codex authentication probe failed'] };
  }
}

async function claudeAuthCheck(rt: Runtime): Promise<AuthCheck> {
  try {
    const result = await rt.runCommand('claude', ['auth', 'status', '--json']);
    const parsed = record(JSON.parse(result.stdout));
    const authenticated = parsed?.loggedIn === true || parsed?.authenticated === true;
    const unauthenticated = parsed?.loggedIn === false || parsed?.authenticated === false;
    return {
      state: authenticated ? 'authenticated' : unauthenticated ? 'unauthenticated' : 'unknown',
      source: 'claude auth status --json', status: authenticated ? 'pass' : unauthenticated ? 'fail' : 'warn',
      errors: authenticated ? [] : [unauthenticated ? 'Claude is not authenticated' : 'Claude authentication is unknown'],
    };
  } catch {
    return { state: 'unknown', source: 'claude auth status --json', status: 'warn', errors: ['Claude authentication probe failed'] };
  }
}

async function piAuthCheck(rt: Runtime): Promise<AuthCheck> {
  const sourcePath = join(rt.homeDir, '.pi', 'agent', 'auth.json');
  try {
    const parsed = record(JSON.parse(await rt.readFile(sourcePath)));
    if (!parsed) throw new Error('invalid');
    return {
      state: 'unknown', source: displayHome(sourcePath, rt.homeDir), status: 'warn',
      errors: ['Pi credential file is present but current authentication cannot be verified'],
    };
  } catch {
    return {
      state: 'unauthenticated', source: displayHome(sourcePath, rt.homeDir), status: 'fail',
      errors: ['Pi credential file is missing or invalid'],
    };
  }
}

async function agentCheck<H extends HookGroupBase>(
  agent: AgentKey, hooks: Promise<H>, auth: Promise<AuthCheck>, rt: Runtime,
): Promise<AgentCheck<H>> {
  const [executable, globalConfig, builtInSkills, hookResult, authResult] = await Promise.all([
    executableCheck(AGENTS[agent].command, rt), directoryCheck(agent, rt), builtInSkillsCheck(agent, rt), hooks, auth,
  ]);
  return {
    executable, globalConfig, auth: authResult, builtInSkills, hooks: hookResult,
    status: worstStatus([executable.status, globalConfig.status, authResult.status, builtInSkills.status, hookResult.status]),
  };
}

async function projectConfigCheck(rt: Runtime): Promise<{ check: ProjectConfigCheck; raw: Record<string, unknown> | null }> {
  const target = join(rt.cwd, '.ai-devkit.json');
  let text: string;
  try { text = await rt.readFile(target); } catch {
    return { raw: null, check: {
      path: target, present: false, valid: false, version: null, environments: [],
      status: 'fail', errors: ['project configuration is missing'],
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
    return { source: displayHome(source, rt.homeDir), configured: safeRegistries(parsed.registries), status: 'pass', errors: [] };
  } catch {
    return {
      source: displayHome(source, rt.homeDir), configured: {}, status: 'warn',
      errors: ['global AI DevKit configuration is missing or invalid'],
    };
  }
}

function projectRegistries(raw: Record<string, unknown> | null, source: string): RegistryScopeCheck {
  return raw
    ? { source, configured: safeRegistries(raw.registries), status: 'pass', errors: [] }
    : { source, configured: {}, status: 'fail', errors: ['project registries are unavailable because project configuration is invalid'] };
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
  const executable = await resolveExecutable('tmux', rt);
  if (!executable) return {
    path: null, available: false, version: null, status: 'fail', errors: ['tmux was not found on PATH'],
  };
  try {
    const result = await rt.runCommand('tmux', ['-V']);
    const version = result.stdout.trim().replace(/^tmux\s+/i, '') || null;
    return { path: executable, available: true, version, status: 'pass', errors: [] };
  } catch {
    return { path: executable, available: false, version: null, status: 'fail', errors: ['tmux version probe failed'] };
  }
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
    status: ready ? 'pass' : enabled ? 'fail' : 'warn',
    errors: ready ? [] : [enabled ? 'channel configuration is not ready' : 'channel is disabled'],
  };
}

async function channelsCheck(rt: Runtime): Promise<ChannelsCheck> {
  const target = join(rt.homeDir, '.ai-devkit', 'channels.json');
  let text: string;
  try { text = await rt.readFile(target); } catch {
    const config: ChannelConfigCheck = {
      path: displayHome(target, rt.homeDir), present: false, validJson: false, validSchema: false,
      status: 'warn', errors: ['channel configuration has not been created'],
    };
    return { config, connections: [], readyCount: 0, status: config.status };
  }
  let parsed: Record<string, unknown> | null = null;
  try { parsed = record(JSON.parse(text)); } catch { /* fixed safe error below */ }
  const channelRecord = record(parsed?.channels);
  if (!parsed || !channelRecord) {
    const config: ChannelConfigCheck = {
      path: displayHome(target, rt.homeDir), present: true, validJson: parsed !== null,
      validSchema: false, status: 'fail', errors: ['channel configuration is invalid'],
    };
    return { config, connections: [], readyCount: 0, status: 'fail' };
  }
  const connections = Object.entries(channelRecord).map(([name, entry]) => channelConnection(name, entry));
  const validSchema = connections.every(item => item.status !== 'fail');
  const config: ChannelConfigCheck = {
    path: displayHome(target, rt.homeDir), present: true, validJson: true, validSchema: true,
    status: validSchema ? 'pass' : 'fail', errors: validSchema ? [] : ['one or more channel entries are invalid'],
  };
  config.validSchema = validSchema;
  return {
    config, connections, readyCount: connections.filter(item => item.ready).length,
    status: worstStatus([config.status, ...connections.map(item => item.status)]),
  };
}

function leafStatuses(report: Omit<StatusReport, 'overall' | 'checks'>): CheckStatus[] {
  const { codex, pi, claude } = report.agents;
  return [
    report.aiDevkit.status, report.project.config.status,
    codex.executable.status, codex.globalConfig.status, codex.auth.status, codex.builtInSkills.status,
    codex.hooks.sessionMappingScript.status, codex.hooks.registration.status, codex.hooks.mappingFile.status,
    pi.executable.status, pi.globalConfig.status, pi.auth.status, pi.builtInSkills.status,
    pi.hooks.sessionTracker.status,
    claude.executable.status, claude.globalConfig.status, claude.auth.status, claude.builtInSkills.status,
    claude.hooks.promptScript.status, claude.hooks.registration.status,
    report.tmux.status, report.registries.project.status, report.registries.global.status,
    report.channels.config.status, ...report.channels.connections.map(item => item.status),
  ];
}

export async function getStatusReport(options: StatusServiceOptions = {}): Promise<StatusReport> {
  const rt = runtime(options);
  const projectPromise = projectConfigCheck(rt);
  const [project, codex, pi, claude, aiDevkit, tmux, globalRegistry, channels] = await Promise.all([
    projectPromise,
    agentCheck('codex', codexHooks(rt), codexAuthCheck(rt), rt),
    agentCheck('pi', piHooks(rt), piAuthCheck(rt), rt),
    agentCheck('claude', claudeHooks(rt), claudeAuthCheck(rt), rt),
    versionCheck(rt), tmuxCheck(rt), globalRegistries(rt), channelsCheck(rt),
  ]);
  const registries: RegistriesCheck = {
    project: projectRegistries(project.raw, project.check.path), global: globalRegistry,
    status: worstStatus([project.raw ? 'pass' : 'fail', globalRegistry.status]),
  };
  const partial = {
    generatedAt: rt.now().toISOString(), aiDevkit,
    project: { cwd: rt.cwd, config: project.check }, agents: { codex, pi, claude },
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
