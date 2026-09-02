import { constants } from 'node:fs';
import { access as fsAccess, readFile as fsReadFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { delimiter, join } from 'node:path';
import { promisify } from 'node:util';
import { getCodexCapacityReport } from '../capacity/index.js';
import { AGENTS, type StartableAgentType } from '../utils/agents.js';

const execFileAsync = promisify(execFile);
const READINESS_AGENT_TYPES = ['claude', 'codex', 'copilot', 'grok_cli', 'opencode', 'pi'] as const;
const ANSI_ESCAPE_PATTERN = new RegExp(`${String.fromCharCode(27)}\\[[0-?]*[ -/]*[@-~]`, 'g');

export type ReadinessStatus = 'pass' | 'warn' | 'fail';
export type ReadinessAuthState = 'authenticated' | 'unauthenticated' | 'unknown';
export type ReadinessAgentType = Exclude<StartableAgentType, 'gemini_cli'>;
type ReadinessInfoStatus = ReadinessStatus | 'info';

type CommandResult = { stdout: string; stderr: string };
type ReadFile = (target: string) => Promise<string>;
type Access = (target: string, mode?: number) => Promise<void>;
type RunCommand = (command: string, args: string[]) => Promise<CommandResult>;

export interface ReadinessCheck<S extends ReadinessInfoStatus = ReadinessStatus> {
    status: S;
    errors: string[];
}

export interface ExecutableReadinessCheck extends ReadinessCheck {
    command: string;
    path: string | null;
}

export interface DirectoryReadinessCheck extends ReadinessCheck {
    path: string;
    present: boolean;
    readable: boolean;
}

export interface BuiltInSkillsReadinessCheck extends ReadinessCheck<'info'> {
    path: string | null;
    required: number;
    present: number;
    missing: string[];
}

export interface AuthReadinessCheck extends ReadinessCheck {
    state: ReadinessAuthState;
    source: string;
    provider: string | null;
    availableProviders: string[];
}

export interface IntegrationReadinessCheck extends ReadinessCheck {
    label: string;
    installed: boolean;
    details?: Record<string, unknown>;
}

export interface AgentReadinessReport {
    type: ReadinessAgentType;
    executable: ExecutableReadinessCheck;
    globalConfig: DirectoryReadinessCheck;
    builtInSkills: BuiltInSkillsReadinessCheck;
    auth?: AuthReadinessCheck;
    integration?: IntegrationReadinessCheck;
    status: ReadinessStatus;
}

export interface AgentReadinessOptions {
    homeDir?: string;
    path?: string;
    assetRoot?: string;
    builtInSkillNames?: readonly string[];
    skillRoots?: Partial<Record<ReadinessAgentType, string>>;
    readFile?: ReadFile;
    access?: Access;
    runCommand?: RunCommand;
    codexAuth?: () => Promise<boolean | null>;
}

type Runtime = Required<Omit<AgentReadinessOptions, 'assetRoot' | 'builtInSkillNames' | 'skillRoots'>> & {
    assetRoot: string | null;
    builtInSkillNames: readonly string[];
    skillRoots: Partial<Record<ReadinessAgentType, string>>;
};

const AGENT_HOME_DIRS: Record<ReadinessAgentType, string> = {
    claude: '.claude',
    codex: '.codex',
    copilot: '.copilot',
    grok_cli: '.grok',
    opencode: '.config/opencode',
    pi: '.pi',
};

function runtime(options: AgentReadinessOptions): Runtime {
    return {
        homeDir: options.homeDir ?? process.env.HOME ?? '',
        path: options.path ?? process.env.PATH ?? '',
        assetRoot: options.assetRoot ?? null,
        builtInSkillNames: options.builtInSkillNames ?? [],
        skillRoots: options.skillRoots ?? {},
        readFile: options.readFile ?? (target => fsReadFile(target, 'utf8')),
        access: options.access ?? ((target, mode = constants.R_OK) => fsAccess(target, mode)),
        runCommand: options.runCommand ?? defaultRunCommand,
        codexAuth: options.codexAuth ?? (async () => (await getCodexCapacityReport()).authenticated),
    };
}

async function defaultRunCommand(command: string, args: string[]): Promise<CommandResult> {
    const result = await execFileAsync(command, args, {
        encoding: 'utf8',
        timeout: 5000,
        maxBuffer: 1024 * 1024,
    });
    return { stdout: result.stdout, stderr: result.stderr };
}

function statusRank(status: ReadinessStatus): number {
    return status === 'fail' ? 2 : status === 'warn' ? 1 : 0;
}

export function worstReadinessStatus(statuses: ReadinessStatus[]): ReadinessStatus {
    return statuses.reduce<ReadinessStatus>((worst, current) =>
        statusRank(current) > statusRank(worst) ? current : worst, 'pass');
}

function displayHome(target: string, homeDir: string): string {
    return target === homeDir ? '~' : target.startsWith(`${homeDir}/`) ? `~${target.slice(homeDir.length)}` : target;
}

function record(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown> : null;
}

function nonEmpty(value: unknown): boolean {
    return typeof value === 'string' && value.trim().length > 0;
}

async function accessible(target: string, rt: Runtime, mode = constants.R_OK): Promise<boolean> {
    try {
        await rt.access(target, mode);
        return true;
    } catch {
        return false;
    }
}

async function resolveExecutable(command: string, rt: Runtime): Promise<string | null> {
    const candidates = rt.path.split(delimiter).filter(Boolean).map(directory => join(directory, command));
    const checks = await Promise.all(candidates.map(async target => ({
        target,
        available: await accessible(target, rt, constants.X_OK),
    })));
    return checks.find(check => check.available)?.target ?? null;
}

async function executableCheck(agent: ReadinessAgentType, rt: Runtime): Promise<ExecutableReadinessCheck> {
    const command = AGENTS[agent].command;
    const resolvedPath = await resolveExecutable(command, rt);
    return {
        command,
        path: resolvedPath,
        status: resolvedPath ? 'pass' : 'fail',
        errors: resolvedPath ? [] : [`${command} was not found on PATH`],
    };
}

async function directoryCheck(agent: ReadinessAgentType, rt: Runtime): Promise<DirectoryReadinessCheck> {
    const target = join(rt.homeDir, AGENT_HOME_DIRS[agent]);
    const readable = await accessible(target, rt);
    return {
        path: displayHome(target, rt.homeDir),
        present: readable,
        readable,
        status: readable ? 'pass' : 'fail',
        errors: readable ? [] : ['global configuration directory is unavailable'],
    };
}

async function builtInSkillsCheck(agent: ReadinessAgentType, rt: Runtime): Promise<BuiltInSkillsReadinessCheck> {
    const relativeRoot = rt.skillRoots[agent];
    if (!relativeRoot) {
        return {
            path: null,
            required: rt.builtInSkillNames.length,
            present: 0,
            missing: [...rt.builtInSkillNames],
            status: 'info',
            errors: [],
        };
    }
    const root = join(rt.homeDir, relativeRoot);
    const checks = await Promise.all(rt.builtInSkillNames.map(async name => ({
        name,
        present: await accessible(join(root, name, 'SKILL.md'), rt),
    })));
    const present = checks.filter(check => check.present).map(check => check.name);
    const missing = rt.builtInSkillNames.filter(name => !present.includes(name));
    return {
        path: displayHome(root, rt.homeDir),
        required: rt.builtInSkillNames.length,
        present: present.length,
        missing: [...missing],
        status: 'info',
        errors: [],
    };
}

async function scriptCheck(installed: string, bundled: string, rt: Runtime): Promise<ReadinessCheck & {
    path: string;
    present: boolean;
    readable: boolean;
    matchesBundledAsset: boolean;
}> {
    let installedText: string;
    try {
        installedText = await rt.readFile(installed);
    } catch {
        return {
            path: displayHome(installed, rt.homeDir),
            present: false,
            readable: false,
            matchesBundledAsset: false,
            status: 'fail',
            errors: ['hook script is unavailable'],
        };
    }
    try {
        const bundledText = await rt.readFile(bundled);
        const matches = installedText === bundledText;
        return {
            path: displayHome(installed, rt.homeDir),
            present: true,
            readable: true,
            matchesBundledAsset: matches,
            status: matches ? 'pass' : 'fail',
            errors: matches ? [] : ['hook script differs from the bundled AI DevKit asset'],
        };
    } catch {
        return {
            path: displayHome(installed, rt.homeDir),
            present: true,
            readable: true,
            matchesBundledAsset: false,
            status: 'fail',
            errors: ['bundled hook asset is unavailable'],
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
    target: string,
    event: string,
    command: string,
    rt: Runtime,
): Promise<ReadinessCheck & { path: string; event: string; command: string; present: boolean; valid: boolean }> {
    try {
        const parsed = JSON.parse(await rt.readFile(target));
        const valid = containsHook(parsed, event, command);
        return {
            path: displayHome(target, rt.homeDir),
            event,
            command,
            present: true,
            valid,
            status: valid ? 'pass' : 'fail',
            errors: valid ? [] : ['required hook registration is missing'],
        };
    } catch {
        return {
            path: displayHome(target, rt.homeDir),
            event,
            command,
            present: false,
            valid: false,
            status: 'fail',
            errors: ['hook configuration is missing or invalid'],
        };
    }
}

async function mappingCheck(target: string, rt: Runtime): Promise<ReadinessCheck & {
    path: string;
    present: boolean;
    valid: boolean;
    invalidEntries: number;
    staleEntries: number;
}> {
    let text: string;
    try {
        text = await rt.readFile(target);
    } catch {
        return {
            path: displayHome(target, rt.homeDir),
            present: false,
            valid: false,
            invalidEntries: 0,
            staleEntries: 0,
            status: 'warn',
            errors: ['session mapping has not been created'],
        };
    }
    let parsed: Record<string, unknown> | null = null;
    try {
        parsed = record(JSON.parse(text));
    } catch {
        // Fixed safe error below.
    }
    if (!parsed) {
        return {
            path: displayHome(target, rt.homeDir),
            present: true,
            valid: false,
            invalidEntries: 0,
            staleEntries: 0,
            status: 'fail',
            errors: ['session mapping is invalid'],
        };
    }
    const entries = await Promise.all(Object.entries(parsed).map(async ([pid, sessionPath]) => {
        if (!/^\d+$/.test(pid) || typeof sessionPath !== 'string' || !sessionPath) {
            return { valid: false, stale: false };
        }
        return { valid: true, stale: !await accessible(sessionPath, rt) };
    }));
    const invalidEntries = entries.filter(entry => !entry.valid).length;
    const staleEntries = entries.filter(entry => entry.stale).length;
    const valid = invalidEntries === 0;
    return {
        path: displayHome(target, rt.homeDir),
        present: true,
        valid,
        invalidEntries,
        staleEntries,
        status: !valid ? 'fail' : staleEntries ? 'warn' : 'pass',
        errors: !valid ? ['session mapping contains invalid entries'] : staleEntries ? ['session mapping contains stale entries'] : [],
    };
}

async function codexAuthCheck(rt: Runtime): Promise<AuthReadinessCheck> {
    try {
        const value = await rt.codexAuth();
        return {
            state: value === true ? 'authenticated' : value === false ? 'unauthenticated' : 'unknown',
            source: displayHome(join(rt.homeDir, '.codex', 'auth.json'), rt.homeDir),
            provider: null,
            availableProviders: [],
            status: value === true ? 'pass' : value === false ? 'fail' : 'warn',
            errors: value === true ? [] : [value === false ? 'Codex is not authenticated' : 'Codex authentication is unknown'],
        };
    } catch {
        return {
            state: 'unknown',
            source: '~/.codex/auth.json',
            provider: null,
            availableProviders: [],
            status: 'warn',
            errors: ['Codex authentication probe failed'],
        };
    }
}

async function claudeAuthCheck(rt: Runtime): Promise<AuthReadinessCheck> {
    try {
        const result = await rt.runCommand('claude', ['auth', 'status', '--json']);
        const parsed = record(JSON.parse(result.stdout));
        const authenticated = parsed?.loggedIn === true || parsed?.authenticated === true;
        const unauthenticated = parsed?.loggedIn === false || parsed?.authenticated === false;
        return {
            state: authenticated ? 'authenticated' : unauthenticated ? 'unauthenticated' : 'unknown',
            source: 'claude auth status --json',
            provider: null,
            availableProviders: [],
            status: authenticated ? 'pass' : unauthenticated ? 'fail' : 'warn',
            errors: authenticated ? [] : [unauthenticated ? 'Claude is not authenticated' : 'Claude authentication is unknown'],
        };
    } catch {
        return {
            state: 'unknown',
            source: 'claude auth status --json',
            provider: null,
            availableProviders: [],
            status: 'warn',
            errors: ['Claude authentication probe failed'],
        };
    }
}

function piProviderNames(parsed: Record<string, unknown>): string[] {
    const names = new Set<string>();
    if (nonEmpty(parsed.provider)) names.add((parsed.provider as string).trim());
    const providers = record(parsed.providers);
    if (providers) {
        for (const name of Object.keys(providers)) {
            if (name.trim()) names.add(name);
        }
    }
    for (const [name, value] of Object.entries(parsed)) {
        if (name === 'provider' || name === 'providers') continue;
        if (record(value) && name.trim()) names.add(name);
    }
    return [...names].sort();
}

async function piAuthCheck(rt: Runtime): Promise<AuthReadinessCheck> {
    const sourcePath = join(rt.homeDir, '.pi', 'agent', 'auth.json');
    try {
        const parsed = record(JSON.parse(await rt.readFile(sourcePath)));
        if (!parsed) throw new Error('invalid');
        const availableProviders = piProviderNames(parsed);
        const provider = nonEmpty(parsed.provider) ? (parsed.provider as string).trim() : null;
        const authenticated = availableProviders.length > 0;
        return {
            state: authenticated ? 'authenticated' : 'unauthenticated',
            source: displayHome(sourcePath, rt.homeDir),
            provider,
            availableProviders,
            status: authenticated ? 'pass' : 'fail',
            errors: authenticated ? [] : ['Pi credential file has no configured model provider'],
        };
    } catch {
        return {
            state: 'unauthenticated',
            source: displayHome(sourcePath, rt.homeDir),
            provider: null,
            availableProviders: [],
            status: 'fail',
            errors: ['Pi credential file is missing or invalid'],
        };
    }
}

async function opencodeAuthCheck(rt: Runtime): Promise<AuthReadinessCheck> {
    try {
        const result = await rt.runCommand('opencode', ['auth', 'list']);
        const availableProviders = opencodeAuthProviderNames(result.stdout);
        const authenticated = availableProviders.length > 0;
        return {
            state: authenticated ? 'authenticated' : 'unauthenticated',
            source: 'opencode auth list',
            provider: null,
            availableProviders,
            status: authenticated ? 'pass' : 'fail',
            errors: authenticated ? [] : ['OpenCode has no configured credentials'],
        };
    } catch {
        return {
            state: 'unknown',
            source: 'opencode auth list',
            provider: null,
            availableProviders: [],
            status: 'warn',
            errors: ['OpenCode authentication probe failed'],
        };
    }
}

async function copilotAuthCheck(rt: Runtime): Promise<AuthReadinessCheck> {
    try {
        await rt.runCommand('gh', ['auth', 'status', '--hostname', 'github.com']);
        return {
            state: 'authenticated',
            source: 'gh auth status --hostname github.com',
            provider: 'github',
            availableProviders: ['GitHub'],
            status: 'pass',
            errors: [],
        };
    } catch {
        return {
            state: 'unknown',
            source: 'gh auth status --hostname github.com',
            provider: null,
            availableProviders: ['GitHub'],
            status: 'warn',
            errors: ['Copilot authentication could not be verified through GitHub CLI'],
        };
    }
}

function opencodeAuthProviderNames(output: string): string[] {
    const names = new Set<string>();
    for (const line of stripAnsi(output).split(/\r?\n/)) {
        const match = /^\s*[●*+-]\s+(.+?)\s*$/.exec(line);
        if (!match) continue;
        const name = match[1].replace(/\s+(?:api|oauth|[\w-]*token|[A-Z][A-Z0-9_]+)$/i, '').trim();
        if (name && !/^\d+\s+(?:credentials?|environment variables?)$/i.test(name)) names.add(name);
    }
    return [...names].sort();
}

function stripAnsi(value: string): string {
    return value.replace(ANSI_ESCAPE_PATTERN, '');
}

async function codexIntegrationCheck(rt: Runtime): Promise<IntegrationReadinessCheck> {
    const script = await scriptCheck(
        join(rt.homeDir, '.codex', 'hooks', 'codex-session-mapping.cjs'),
        join(rt.assetRoot ?? '', 'codex', 'codex-session-mapping.cjs'),
        rt,
    );
    const registration = await registrationCheck(
        join(rt.homeDir, '.codex', 'hooks.json'),
        'SessionStart',
        'node ~/.codex/hooks/codex-session-mapping.cjs',
        rt,
    );
    const mappingFile = await mappingCheck(join(rt.homeDir, '.codex', 'ai-devkit', 'sessions.json'), rt);
    const installed = script.status === 'pass' && registration.status === 'pass';
    return {
        label: 'ai-devkit hook',
        installed,
        status: worstReadinessStatus([script.status, registration.status, mappingFile.status]),
        errors: [...script.errors, ...registration.errors, ...mappingFile.errors],
        details: { sessionMappingScript: script, registration, mappingFile },
    };
}

async function claudeIntegrationCheck(rt: Runtime): Promise<IntegrationReadinessCheck> {
    const script = await scriptCheck(
        join(rt.homeDir, '.claude', 'hooks', 'claude-prompt-hook.js'),
        join(rt.assetRoot ?? '', 'claude', 'claude-prompt-hook.js'),
        rt,
    );
    const registration = await registrationCheck(
        join(rt.homeDir, '.claude', 'settings.json'),
        'PreToolUse',
        'node ~/.claude/hooks/claude-prompt-hook.js',
        rt,
    );
    const installed = script.status === 'pass' && registration.status === 'pass';
    return {
        label: 'ai-devkit hook',
        installed,
        status: worstReadinessStatus([script.status, registration.status]),
        errors: [...script.errors, ...registration.errors],
        details: { promptScript: script, registration },
    };
}

async function piIntegrationCheck(rt: Runtime): Promise<IntegrationReadinessCheck> {
    let installed = false;
    try {
        const result = await rt.runCommand('pi', ['list']);
        installed = isPiSessionTrackerListed(result.stdout);
    } catch {
        // Safe fixed result below.
    }
    const mapping = await mappingCheck(join(rt.homeDir, '.pi', 'agent', 'sessions.json'), rt);
    const mappingStatus: ReadinessStatus = mapping.valid || !mapping.present ? 'pass' : 'fail';
    const status = worstReadinessStatus([installed ? 'pass' : 'fail', mappingStatus]);
    return {
        label: 'ai-devkit plugin',
        installed,
        status,
        errors: [
            ...(!installed ? ['Pi session tracker is not registered'] : []),
            ...(mappingStatus === 'fail' ? mapping.errors : []),
        ],
        details: {
            package: '@ai-devkit/pi-session-tracker',
            registryPath: mapping.path,
            registryValid: mapping.valid,
            invalidEntries: mapping.invalidEntries,
            staleEntries: mapping.staleEntries,
        },
    };
}

function isPiSessionTrackerListed(output: string): boolean {
    const normalized = output.toLowerCase();
    return normalized.includes('@ai-devkit/pi-session-tracker') || /\bsession[\s-]+tracker\b/.test(normalized);
}

type AuthCheck = (rt: Runtime) => Promise<AuthReadinessCheck>;
type IntegrationCheck = (rt: Runtime) => Promise<IntegrationReadinessCheck>;

const AUTH_CHECKS: Partial<Record<ReadinessAgentType, AuthCheck>> = {
    claude: claudeAuthCheck,
    codex: codexAuthCheck,
    copilot: copilotAuthCheck,
    opencode: opencodeAuthCheck,
    pi: piAuthCheck,
};

const INTEGRATION_CHECKS: Partial<Record<ReadinessAgentType, IntegrationCheck>> = {
    claude: claudeIntegrationCheck,
    codex: codexIntegrationCheck,
    pi: piIntegrationCheck,
};

async function authCheck(agent: ReadinessAgentType, rt: Runtime): Promise<AuthReadinessCheck | undefined> {
    return AUTH_CHECKS[agent]?.(rt);
}

async function integrationCheck(agent: ReadinessAgentType, rt: Runtime): Promise<IntegrationReadinessCheck | undefined> {
    return INTEGRATION_CHECKS[agent]?.(rt);
}

export async function getAgentReadinessReport(
    agent: ReadinessAgentType,
    options: AgentReadinessOptions = {},
): Promise<AgentReadinessReport> {
    return agentReadiness(agent, runtime(options));
}

async function agentReadiness(agent: ReadinessAgentType, rt: Runtime): Promise<AgentReadinessReport> {
    const [executable, globalConfig, builtInSkills, auth, integration] = await Promise.all([
        executableCheck(agent, rt),
        directoryCheck(agent, rt),
        builtInSkillsCheck(agent, rt),
        authCheck(agent, rt),
        integrationCheck(agent, rt),
    ]);
    return {
        type: agent,
        executable,
        globalConfig,
        builtInSkills,
        auth,
        integration,
        status: worstReadinessStatus([
            executable.status,
            globalConfig.status,
            ...(auth ? [auth.status] : []),
            ...(integration ? [integration.status] : []),
        ]),
    };
}

export async function getAgentReadinessReports(
    options: AgentReadinessOptions = {},
): Promise<Record<ReadinessAgentType, AgentReadinessReport>> {
    const rt = runtime(options);
    const entries = await Promise.all(READINESS_AGENT_TYPES.map(async agent => [
        agent,
        await agentReadiness(agent, rt),
    ] as const));
    return Object.fromEntries(entries) as Record<ReadinessAgentType, AgentReadinessReport>;
}
