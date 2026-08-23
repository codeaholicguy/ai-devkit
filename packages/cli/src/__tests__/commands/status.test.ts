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
function agent(status: 'pass' | 'warn' | 'fail') {
  return {
    status,
    executable: { ...base, command: 'agent', path: '/bin/agent' },
    globalConfig: { ...base, path: '~/.agent', present: true, readable: true },
    auth: { ...base, state: 'authenticated', source: 'test' },
    builtInSkills: { ...base, path: '~/.agent/skills', required: 20, present: 20, missing: [] },
    hooks: { status: 'pass' },
  };
}
const report = {
  generatedAt: '2026-08-23T00:00:00.000Z',
  overall: 'warn',
  aiDevkit: { ...base, installedVersion: '0.55.0', latestVersion: '0.56.0', updateAvailable: true, latestVersionSource: 'npm' },
  project: { cwd: '/repo', config: { ...base, path: '/repo/.ai-devkit.json', present: true, valid: true, version: '0.55.0', environments: ['codex'] } },
  agents: {
    codex: agent('pass'), pi: agent('warn'), claude: agent('fail'),
  },
  tmux: { ...base, path: '/bin/tmux', available: true, version: '3.4' },
  registries: { project: { ...base, source: '/repo/.ai-devkit.json', configured: {} }, global: { ...base, source: '~/.ai-devkit/.ai-devkit.json', configured: {} }, status: 'pass' },
  channels: { config: { ...base, path: '~/.ai-devkit/channels.json', present: true, validJson: true, validSchema: true }, connections: [], readyCount: 0, status: 'pass' },
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
    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Agent', 'Status'],
      rows: [['codex', 'pass'], ['pi', 'warn'], ['claude', 'fail']],
    }));
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
