import { describe, expect, it, vi } from 'vitest';
import {
  calculateTimingStats,
  createDefaultBenchmarkPlan,
  evaluateBenchmarkGate,
  resolveDefaultRootDir,
  runBenchmarkCase,
} from '../../util/cli-benchmark.js';

describe('cli benchmark utility', () => {
  it('computes timing statistics from samples', () => {
    const stats = calculateTimingStats([30, 10, 50, 20, 40]);

    expect(stats).toEqual({
      minMs: 10,
      p50Ms: 30,
      p95Ms: 50,
      maxMs: 50,
      avgMs: 30,
    });
  });

  it('counts failed command exits while reporting timings', () => {
    const spawn = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 2 })
      .mockReturnValueOnce({ status: null, error: new Error('spawn failed') });
    const nowValues = [0, 10, 10, 25, 25, 55];
    const now = vi.fn(() => nowValues.shift() ?? 55);

    const result = runBenchmarkCase({
      label: 'version',
      command: ['node', 'dist/cli.js', '--version'],
      iterations: 3,
      spawn,
      now,
    });

    expect(result).toMatchObject({
      label: 'version',
      command: ['node', 'dist/cli.js', '--version'],
      iterations: 3,
      failures: 2,
      minMs: 10,
      p50Ms: 15,
      p95Ms: 30,
      maxMs: 30,
      avgMs: 18.333,
    });
  });

  it('creates the required startup and smoke benchmark cases', () => {
    const plan = createDefaultBenchmarkPlan({
      cliPath: 'packages/cli/dist/cli.js',
      iterations: 20,
      rootDir: '/repo',
      tempRoot: '/tmp/ai-devkit-cli-benchmark-test',
      nodePath: '/usr/local/bin/node',
    });

    expect(plan.cases.map((benchmarkCase) => benchmarkCase.label)).toEqual([
      'version',
      'root-help',
      'init-help',
      'phase-help',
      'setup-help',
      'lint-help',
      'install-help',
      'memory-help',
      'skill-help',
      'agent-help',
      'channel-help',
      'docs-help',
      'lint',
      'agent-list-json',
      'memory-search',
    ]);

    expect(plan.cases.every((benchmarkCase) => benchmarkCase.iterations === 20)).toBe(true);
    expect(plan.cases.find((benchmarkCase) => benchmarkCase.label === 'memory-search')).toMatchObject({
      cwd: '/tmp/ai-devkit-cli-benchmark-test',
      command: ['/usr/local/bin/node', '/repo/packages/cli/dist/cli.js', 'memory', 'search', '--query', 'startup performance', '--limit', '1'],
    });
    plan.cleanup();
  });

  it('resolves the repository root from the built benchmark script location', () => {
    expect(resolveDefaultRootDir('file:///repo/packages/cli/dist/util/cli-benchmark.js')).toBe('/repo');
  });

  it('fails the startup gate for slow or failed required startup cases only', () => {
    const gate = evaluateBenchmarkGate([
      {
        label: 'version',
        command: ['node', 'cli.js', '--version'],
        iterations: 20,
        minMs: 10,
        p50Ms: 51,
        p95Ms: 60,
        maxMs: 70,
        avgMs: 52,
        failures: 0,
      },
      {
        label: 'lint',
        command: ['node', 'cli.js', 'lint'],
        iterations: 20,
        minMs: 100,
        p50Ms: 500,
        p95Ms: 600,
        maxMs: 700,
        avgMs: 520,
        failures: 0,
      },
      {
        label: 'agent-help',
        command: ['node', 'cli.js', 'agent', '--help'],
        iterations: 20,
        minMs: 20,
        p50Ms: 30,
        p95Ms: 40,
        maxMs: 50,
        avgMs: 32,
        failures: 1,
      },
    ], { startupThresholdMs: 50 });

    expect(gate.pass).toBe(false);
    expect(gate.failures).toEqual([
      'version p50 51ms exceeded startup threshold 50ms',
      'agent-help had 1 failed run(s)',
    ]);
  });
});
