import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { capacityCommand, registerCapacityCommand } from '../../../commands/capacity.js';
import { renderCapacityReport } from '../../../commands/capacity/render.js';
import type { CapacityReport } from '@ai-devkit/agent-manager';
import { ui } from '../../../util/terminal-ui.js';

vi.mock('../../../util/terminal-ui.js', () => ({ ui: { text: vi.fn() } }));

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

  it('renders schema-v1 JSON exactly through terminal UI', () => {
    renderCapacityReport(report, { json: true });
    expect(ui.text).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
  });

  it('renders text labels, arbitrary short/long windows, credits, and warnings', () => {
    renderCapacityReport(report);
    const output = vi.mocked(ui.text).mock.calls.map(call => call[0]).join('\n');
    expect(output).toContain('Provider');
    expect(output).toContain('Auth');
    expect(output).toContain('Available');
    expect(output).toContain('80% left');
    expect(output).toContain('40% left');
    expect(output).toContain('1');
    expect(output).toContain('Warnings:');
    expect(output).toContain('A safe normalized warning.');
  });

  it('wires the Codex-only command surface', async () => {
    const getReport = vi.fn(async () => report);
    const program = new Command();
    program.exitOverride();
    registerCapacityCommand(program, getReport);
    await program.parseAsync(['node', 'test', 'capacity', 'codex', '--json']);

    expect(getReport).toHaveBeenCalledWith();
    expect(ui.text).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
  });

  it('rejects non-Codex providers before probing', async () => {
    const getReport = vi.fn(async () => report);
    await expect(capacityCommand('claude', {}, getReport)).rejects.toThrow(
      'Only "codex" is supported'
    );
    expect(getReport).not.toHaveBeenCalled();
  });
});
