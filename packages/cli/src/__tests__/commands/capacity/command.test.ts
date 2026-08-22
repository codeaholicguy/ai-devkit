import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capacityCommand, registerCapacityCommand } from '../../../commands/capacity.js';
import { renderCapacityReport } from '../../../commands/capacity/render.js';
import type { CapacityReport } from '@ai-devkit/agent-manager';
import { ui } from '../../../util/terminal-ui.js';

vi.mock('../../../util/terminal-ui.js', () => ({
  ui: { text: vi.fn(), table: vi.fn(), warning: vi.fn(), breakline: vi.fn() },
}));

const report: CapacityReport = {
  schemaVersion: 1,
  generatedAt: '2026-08-09T10:00:00.000Z',
  providers: [{
    provider: 'codex', agentType: 'codex', configured: true, installed: true,
    authenticated: true, status: 'supported', available: 'yes', plan: 'pro',
    checkedAt: '2026-08-09T10:00:00.000Z', source: 'provider-cli',
    windows: [
      { id: 'short', label: '5 hour', durationMinutes: 300, usedPercent: 20,
        remainingPercent: 80, resetsAt: '2026-08-09T12:00:00.000Z', scope: 'codex' },
      { id: 'long', label: '7 day', durationMinutes: 10080, usedPercent: 60,
        remainingPercent: 40, resetsAt: '2026-08-16T10:00:00.000Z', scope: 'codex' }
    ],
    aliases: { dailyWindowId: null, weeklyWindowId: 'long' },
    resetCredits: { available: 1 },
    warnings: [{ code: 'sample-warning', message: 'A safe normalized warning.' }]
  }]
};

describe('capacity command', () => {
  beforeEach(() => vi.clearAllMocks());

  it('renders the JSON report exactly', () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    renderCapacityReport(report, { json: true });
    expect(log).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
    log.mockRestore();
  });

  it('renders the table, windows, credits, and warnings through the shared terminal UI', () => {
    renderCapacityReport(report);
    expect(ui.text).toHaveBeenCalledWith('Capacity:', { breakline: true });
    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Provider', 'Auth', 'Available', 'Short window', 'Long window', 'Reset credits'],
      rows: [[
        'codex', 'yes', 'yes', '80% left · resets 2026-08-09T12:00:00.000Z',
        '40% left · resets 2026-08-16T10:00:00.000Z', '1',
      ]],
    }));
    expect(ui.warning).toHaveBeenCalledWith('1 warning(s):');
    expect(ui.text).toHaveBeenCalledWith('  codex: A safe normalized warning.');
  });

  it('wires the Codex-only command surface', async () => {
    const getReport = vi.fn(async () => report);
    const program = new Command();
    program.exitOverride();
    registerCapacityCommand(program, getReport);
    await program.parseAsync(['node', 'test', 'capacity', 'codex', '--json']);

    expect(getReport).toHaveBeenCalledWith();
    expect(ui.table).not.toHaveBeenCalled();
  });

  it('rejects non-Codex providers before probing', async () => {
    const getReport = vi.fn(async () => report);
    await expect(capacityCommand('claude', {}, getReport)).rejects.toThrow(
      'Only "codex" is supported'
    );
    expect(getReport).not.toHaveBeenCalled();
  });
});
