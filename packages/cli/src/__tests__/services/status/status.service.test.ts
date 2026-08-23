import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { getStatusReport, type StatusServiceOptions } from '../../../services/status/status.service.js';

type Files = Record<string, string>;

function fixture(overrides: Partial<StatusServiceOptions> = {}) {
  const homeDir = '/home/test';
  const cwd = '/repo';
  const assetRoot = '/assets';
  const builtIns = [
    'agent-communication', 'agent-management', 'dev-commit', 'dev-lifecycle', 'dev-worktree',
    'dev-requirements', 'dev-design', 'dev-planning', 'dev-implementation', 'dev-testing',
    'dev-review', 'dev-pr', 'structured-debug', 'document-code', 'memory', 'task',
    'simplify-implementation', 'brainstorm', 'verify', 'tdd',
  ];
  const files: Files = {
    [path.join(cwd, '.ai-devkit.json')]: JSON.stringify({
      version: '0.55.0', environments: ['codex', 'pi', 'claude'], phases: [], createdAt: 'now',
      registries: {
        project: 'https://example.test/project.git',
        private: 'https://user:registry-secret@example.test/private.git?token=query-secret',
      },
    }),
    [path.join(homeDir, '.ai-devkit', '.ai-devkit.json')]: JSON.stringify({
      registries: { global: 'https://example.test/global.git' },
    }),
    [path.join(homeDir, '.ai-devkit', 'channels.json')]: JSON.stringify({ channels: {
      telegram: { type: 'telegram', enabled: true, createdAt: 'now', config: {
        botToken: 'telegram-secret', botUsername: 'safe-bot', authorizedChatId: 42,
      } },
      slack: { type: 'slack', enabled: true, createdAt: 'now', config: {
        appToken: 'xapp-secret', botToken: 'xoxb-secret', botUserId: 'B1', workspaceId: 'W1',
        transport: 'socket-mode', audience: 'dm',
      } },
    } }),
    [path.join(homeDir, '.codex', 'hooks', 'codex-session-mapping.cjs')]: 'codex-hook',
    [path.join(assetRoot, 'codex', 'codex-session-mapping.cjs')]: 'codex-hook',
    [path.join(homeDir, '.codex', 'hooks.json')]: JSON.stringify({ hooks: { SessionStart: [{ hooks: [
      { type: 'command', command: 'node ~/.codex/hooks/codex-session-mapping.cjs' },
    ] }] } }),
    [path.join(homeDir, '.codex', 'ai-devkit', 'sessions.json')]: JSON.stringify({ '123': '/sessions/codex.jsonl' }),
    '/sessions/codex.jsonl': '',
    [path.join(homeDir, '.claude', 'hooks', 'claude-prompt-hook.js')]: 'claude-hook',
    [path.join(assetRoot, 'claude', 'claude-prompt-hook.js')]: 'claude-hook',
    [path.join(homeDir, '.claude', 'settings.json')]: JSON.stringify({ hooks: { PreToolUse: [{ hooks: [
      { type: 'command', command: 'node ~/.claude/hooks/claude-prompt-hook.js' },
    ] }] } }),
    [path.join(homeDir, '.pi', 'agent', 'sessions.json')]: JSON.stringify({ '456': '/sessions/pi.jsonl' }),
    '/sessions/pi.jsonl': '',
    [path.join(homeDir, '.pi', 'agent', 'auth.json')]: JSON.stringify({ provider: 'anthropic' }),
  };
  for (const directory of ['.codex', '.pi', '.claude']) files[path.join(homeDir, directory)] = '<dir>';
  for (const [agent, skillRoot] of [
    ['codex', path.join(homeDir, '.codex', 'skills')],
    ['pi', path.join(homeDir, '.pi', 'agent', 'skills')],
    ['claude', path.join(homeDir, '.claude', 'skills')],
  ] as const) {
    void agent;
    for (const skill of builtIns) files[path.join(skillRoot, skill, 'SKILL.md')] = '# skill';
  }
  const executablePaths: Record<string, string> = {
    codex: '/bin/codex', pi: '/bin/pi', claude: '/bin/claude', tmux: '/bin/tmux',
  };
  const options: StatusServiceOptions = {
    cwd,
    homeDir,
    path: '/bin',
    assetRoot,
    installedVersion: '0.55.0',
    now: () => new Date('2026-08-23T00:00:00.000Z'),
    readFile: async (target) => {
      if (!(target in files)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return files[target];
    },
    access: async (target, mode) => {
      expect(mode).toBeTypeOf('number');
      if (Object.values(executablePaths).includes(target) || target in files) return;
      throw Object.assign(new Error('missing'), { code: 'ENOENT' });
    },
    runCommand: vi.fn(async (command, args) => {
      if (command === 'tmux') return { stdout: 'tmux 3.4\n', stderr: '' };
      if (command === 'pi') return { stdout: '@ai-devkit/pi-session-tracker\n', stderr: '' };
      if (command === 'claude') return { stdout: JSON.stringify({ loggedIn: true }), stderr: '' };
      if (command === 'npm') return { stdout: '0.56.0\n', stderr: '' };
      throw new Error(`unexpected command ${command} ${args.join(' ')}`);
    }),
    codexAuth: async () => true,
    ...overrides,
  };
  return { options, files };
}

describe('getStatusReport', () => {
  it('builds the canonical per-agent readiness report from verifiable sources', async () => {
    const { options } = fixture();
    const report = await getStatusReport(options);

    expect(report.generatedAt).toBe('2026-08-23T00:00:00.000Z');
    expect(report.agents.codex.executable.path).toBe('/bin/codex');
    expect(report.agents.codex.auth.state).toBe('authenticated');
    expect(report.agents.codex.builtInSkills.missing).toEqual([]);
    expect(report.agents.codex.hooks.mappingFile).toMatchObject({ valid: true, staleEntries: 0 });
    expect(report.agents.pi.hooks.sessionTracker).toMatchObject({ installed: true, registryValid: true });
    expect(report.agents.pi.auth).toMatchObject({ state: 'unknown', status: 'warn' });
    expect(report.agents.claude.hooks.registration).toMatchObject({ present: true, valid: true });
    expect(report.tmux).toMatchObject({ path: '/bin/tmux', available: true, version: '3.4' });
    expect(report.registries.project.configured).toMatchObject({ project: 'https://example.test/project.git' });
    expect(report.registries.global.configured).toEqual({ global: 'https://example.test/global.git' });
    expect(report.aiDevkit).toMatchObject({ installedVersion: '0.55.0', latestVersion: '0.56.0', updateAvailable: true });
    expect(report.project.config).toMatchObject({ present: true, valid: true, environments: ['codex', 'pi', 'claude'] });
    expect(report.channels.connections).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'telegram', ready: true }),
      expect.objectContaining({ name: 'slack', ready: true }),
    ]));
    expect(report.checks.warnings).toBeGreaterThan(0);
    expect(report.registries.project.configured.private).toBe('https://example.test/private.git');
    expect(JSON.stringify(report)).not.toContain('registry-secret');
    expect(JSON.stringify(report)).not.toContain('query-secret');
  });

  it('returns independent findings when files, commands, auth, and npm are unavailable', async () => {
    const { options } = fixture({
      access: async () => { throw new Error('SECRET access failure'); },
      readFile: async () => { throw new Error('SECRET file failure'); },
      runCommand: async () => { throw new Error('SECRET command failure'); },
      codexAuth: async () => null,
    });
    const report = await getStatusReport(options);
    const serialized = JSON.stringify(report);

    expect(report.agents.codex.executable.status).toBe('fail');
    expect(report.agents.claude.auth.state).toBe('unknown');
    expect(report.project.config.present).toBe(false);
    expect(report.aiDevkit.latestVersion).toBeNull();
    expect(report.overall).toBe('fail');
    expect(serialized).not.toContain('SECRET');
    expect(report.agents.codex).toBeDefined();
    expect(report.agents.pi).toBeDefined();
    expect(report.agents.claude).toBeDefined();
  });

  it('reports malformed mappings and channel config without exposing their contents', async () => {
    const { options, files } = fixture();
    files[path.join(options.homeDir!, '.codex', 'ai-devkit', 'sessions.json')] = '{token-secret';
    files[path.join(options.homeDir!, '.ai-devkit', 'channels.json')] = '{channel-secret';

    const report = await getStatusReport(options);
    const serialized = JSON.stringify(report);
    expect(report.agents.codex.hooks.mappingFile.status).toBe('fail');
    expect(report.channels.config).toMatchObject({ present: true, validJson: false, validSchema: false, status: 'fail' });
    expect(serialized).not.toContain('token-secret');
    expect(serialized).not.toContain('channel-secret');
  });

  it('marks the channel schema invalid when an entry is structurally incomplete', async () => {
    const { options, files } = fixture();
    files[path.join(options.homeDir!, '.ai-devkit', 'channels.json')] = JSON.stringify({
      channels: { broken: { type: 'slack', enabled: true, config: { appToken: 'xapp-secret' } } },
    });
    const report = await getStatusReport(options);
    expect(report.channels.config).toMatchObject({ validJson: true, validSchema: false, status: 'fail' });
    expect(report.channels.connections[0]).toMatchObject({ ready: false, status: 'fail' });
  });
});
