import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { registerStatusCommand } from '../../commands/status.js';
import { renderStatusReport } from '../../commands/status/render.js';
import { ui } from '../../util/terminal-ui.js';
import type { StatusReport } from '../../services/status/status.service.js';

vi.mock('../../util/terminal-ui.js', () => ({
  ui: { text: vi.fn(), table: vi.fn(), warning: vi.fn(), breakline: vi.fn() },
}));

const base = { status: 'pass' as const, errors: [] as string[] };
function agent(status: 'pass' | 'warn' | 'fail', options: {
  auth?: boolean;
  integration?: { label: string; installed: boolean };
  executablePath?: string | null;
  builtInSkills?: { status: 'info'; present: number; required: number; missing: string[] };
} = {}) {
  return {
    type: 'codex',
    status,
    executable: {
      status: options.executablePath === null ? 'fail' : 'pass',
      errors: options.executablePath === null ? ['agent was not found on PATH'] : [],
      command: 'agent',
      path: options.executablePath === undefined ? '/bin/agent' : options.executablePath,
    },
    globalConfig: { ...base, path: '~/.agent', present: true, readable: true },
    builtInSkills: options.builtInSkills
      ? { status: options.builtInSkills.status, errors: ['required built-in skills are missing'], path: '~/.agent/skills', ...options.builtInSkills }
      : { status: 'info' as const, errors: [], path: '~/.agent/skills', required: 2, present: 2, missing: [] },
    ...(options.auth ? { auth: { ...base, state: 'authenticated', source: 'test', provider: null, availableProviders: [] } } : {}),
    ...(options.integration ? { integration: { ...base, ...options.integration } } : {}),
  };
}
const report = {
  generatedAt: '2026-08-23T00:00:00.000Z',
  overall: 'warn',
  aiDevkit: { ...base, installedVersion: '0.55.0', latestVersion: '0.56.0', updateAvailable: true, latestVersionSource: 'npm' },
  project: { cwd: '/repo', config: { ...base, path: '/repo/.ai-devkit.json', present: true, valid: true, version: '0.55.0', environments: ['codex'] } },
  agents: {
    codex: { ...agent('pass', { auth: true, integration: { label: 'ai-devkit hook', installed: true } }), type: 'codex' },
    pi: {
      ...agent('warn', { auth: true, integration: { label: 'ai-devkit plugin', installed: true } }),
      type: 'pi',
      auth: { ...base, state: 'authenticated', source: 'test', provider: null, availableProviders: ['anthropic'] },
    },
    claude: { ...agent('fail', { auth: true, integration: { label: 'ai-devkit hook', installed: true } }), type: 'claude' },
    copilot: { ...agent('pass'), type: 'copilot' },
    grok_cli: { ...agent('fail', { executablePath: null }), type: 'grok_cli' },
    opencode: {
      ...agent('pass', {
        auth: true,
        builtInSkills: { status: 'info', present: 1, required: 2, missing: ['remote-two'] },
      }),
      type: 'opencode',
      auth: { ...base, state: 'authenticated', source: 'opencode auth list', provider: null, availableProviders: ['OpenAI', 'litellm'] },
    },
  },
  tmux: { ...base, path: '/bin/tmux', available: true, version: '3.4' },
  registries: { project: { source: '/repo/.ai-devkit.json', configured: {}, errors: [] }, global: { source: '~/.ai-devkit/.ai-devkit.json', configured: {}, errors: [] } },
  channels: { config: { path: '~/.ai-devkit/channels.json', present: true, validJson: true, validSchema: true, errors: [] }, connections: [], readyCount: 0 },
  checks: { passed: 20, warnings: 1, failed: 1 },
} as unknown as StatusReport;

describe('status command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders canonical JSON exactly', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    renderStatusReport(report, { json: true });
    expect(log).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
    expect(ui.table).not.toHaveBeenCalled();
    log.mockRestore();
  });

  it('renders human status with shared terminal tables', () => {
    renderStatusReport(report);
    expect(ui.text).toHaveBeenCalledWith('AI DevKit Status:', { breakline: true });
    expect(ui.text).toHaveBeenCalledWith('Checks:', { breakline: true });
    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Agent', 'Status'],
      rows: [
        ['codex', 'ready'],
        ['pi', 'not ready'],
        ['claude', 'fail'],
        ['copilot', 'ready'],
        ['opencode', 'ready'],
      ],
    }));
    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Check', 'Status', 'Evidence'],
      rows: expect.arrayContaining([
        ['codex: ai-devkit built-in skills', 'info', '2/2'],
        ['codex: ai-devkit hook', 'ready', 'installed'],
        ['pi: ai-devkit plugin', 'ready', 'installed'],
        ['pi: providers', 'info', 'anthropic'],
        ['opencode: ai-devkit built-in skills', 'info', '1/2'],
        ['opencode: auth', 'ready', 'authenticated'],
        ['opencode: providers', 'info', 'OpenAI, litellm'],
      ]),
    }));
    const checkRows = (vi.mocked(ui.table).mock.calls[2][0].rows ?? []) as Array<[string, string, string]>;
    expect(checkRows.some(([label]) => label.startsWith('grok_cli:'))).toBe(false);
    expect(checkRows).not.toContainEqual(['codex: ai-devkit built-in skills', 'pass', '2/2']);
    expect(ui.warning).not.toHaveBeenCalledWith(expect.stringContaining('missing built-in skills'));
  });

  it('registers the top-level status command and passes json intent', async () => {
    const readReport = vi.fn(async () => report);
    const program = new Command();
    registerStatusCommand(program, readReport);
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    await program.parseAsync(['node', 'test', 'status', '--json']);
    expect(readReport).toHaveBeenCalledOnce();
    expect(log).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
    log.mockRestore();
  });
});
