import { spawnSync } from 'child_process';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { fileURLToPath, pathToFileURL } from 'url';

export interface TimingStats {
  minMs: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  avgMs: number;
}

export interface BenchmarkCase {
  label: string;
  command: string[];
  iterations: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
}

export interface BenchmarkCaseResult extends BenchmarkCase, TimingStats {
  failures: number;
}

export interface BenchmarkPlan {
  cases: BenchmarkCase[];
  cleanup: () => void;
}

export interface DefaultBenchmarkPlanOptions {
  cliPath?: string;
  iterations?: number;
  rootDir?: string;
  tempRoot?: string;
  nodePath?: string;
}

export interface BenchmarkGateResult {
  pass: boolean;
  failures: string[];
}

export interface BenchmarkGateOptions {
  startupThresholdMs: number;
}

const STARTUP_GATE_LABELS = new Set([
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
]);

type Spawn = typeof spawnSync;
type Now = () => number;

function roundMs(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.min(Math.max(index, 0), sorted.length - 1)];
}

export function calculateTimingStats(samples: number[]): TimingStats {
  if (samples.length === 0) {
    return { minMs: 0, p50Ms: 0, p95Ms: 0, maxMs: 0, avgMs: 0 };
  }

  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, sample) => sum + sample, 0) / samples.length;

  return {
    minMs: roundMs(sorted[0]),
    p50Ms: roundMs(percentile(sorted, 50)),
    p95Ms: roundMs(percentile(sorted, 95)),
    maxMs: roundMs(sorted[sorted.length - 1]),
    avgMs: roundMs(avg),
  };
}

export function runBenchmarkCase(
  benchmarkCase: BenchmarkCase & { spawn?: Spawn; now?: Now },
): BenchmarkCaseResult {
  const { spawn = spawnSync, now = () => performance.now(), ...caseConfig } = benchmarkCase;
  const samples: number[] = [];
  let failures = 0;
  const [command, ...args] = caseConfig.command;

  for (let i = 0; i < caseConfig.iterations; i += 1) {
    const start = now();
    const result = spawn(command, args, {
      cwd: caseConfig.cwd,
      env: caseConfig.env ? { ...process.env, ...caseConfig.env } : process.env,
      stdio: 'ignore',
    });
    samples.push(now() - start);

    if (result.status !== 0 || result.error) {
      failures += 1;
    }
  }

  return {
    ...caseConfig,
    ...calculateTimingStats(samples),
    failures,
  };
}

export function runCliBenchmark(cases: BenchmarkCase[]): BenchmarkCaseResult[] {
  return cases.map(runBenchmarkCase);
}

export function printBenchmarkResults(results: BenchmarkCaseResult[]): void {
  const rows = results.map((result) => ({
    label: result.label,
    p50: `${result.p50Ms.toFixed(3)}ms`,
    p95: `${result.p95Ms.toFixed(3)}ms`,
    avg: `${result.avgMs.toFixed(3)}ms`,
    failures: result.failures,
  }));
  console.table(rows);
}

export function evaluateBenchmarkGate(
  results: BenchmarkCaseResult[],
  options: BenchmarkGateOptions,
): BenchmarkGateResult {
  const failures: string[] = [];

  for (const result of results) {
    if (!STARTUP_GATE_LABELS.has(result.label)) {
      continue;
    }

    if (result.failures > 0) {
      failures.push(`${result.label} had ${result.failures} failed run(s)`);
    }

    if (result.p50Ms > options.startupThresholdMs) {
      failures.push(`${result.label} p50 ${result.p50Ms}ms exceeded startup threshold ${options.startupThresholdMs}ms`);
    }
  }

  return {
    pass: failures.length === 0,
    failures,
  };
}

export function createDefaultBenchmarkPlan(options: DefaultBenchmarkPlanOptions = {}): BenchmarkPlan {
  const rootDir = options.rootDir ?? process.cwd();
  const cliPath = options.cliPath
    ? path.resolve(rootDir, options.cliPath)
    : path.join(rootDir, 'packages/cli/dist/cli.js');
  const nodePath = options.nodePath ?? process.execPath;
  const cli = [nodePath, cliPath];
  const iterations = options.iterations
    ?? Number.parseInt(process.env.AI_DEVKIT_CLI_BENCHMARK_ITERATIONS ?? '20', 10);
  const tempRoot = options.tempRoot ?? path.join(tmpdir(), `ai-devkit-cli-benchmark-${process.pid}`);

  mkdirSync(tempRoot, { recursive: true });
  writeFileSync(path.join(tempRoot, '.ai-devkit.json'), JSON.stringify({
    version: '0.0.0',
    environments: [],
    phases: ['requirements', 'design', 'planning', 'implementation', 'testing'],
    memory: { path: path.join(tempRoot, 'memory.db') },
  }, null, 2));

  const helpCases: BenchmarkCase[] = [
    { label: 'version', command: [...cli, '--version'], iterations, cwd: rootDir },
    { label: 'root-help', command: [...cli, '--help'], iterations, cwd: rootDir },
    { label: 'init-help', command: [...cli, 'init', '--help'], iterations, cwd: rootDir },
    { label: 'phase-help', command: [...cli, 'phase', '--help'], iterations, cwd: rootDir },
    { label: 'setup-help', command: [...cli, 'setup', '--help'], iterations, cwd: rootDir },
    { label: 'lint-help', command: [...cli, 'lint', '--help'], iterations, cwd: rootDir },
    { label: 'install-help', command: [...cli, 'install', '--help'], iterations, cwd: rootDir },
    { label: 'memory-help', command: [...cli, 'memory', '--help'], iterations, cwd: rootDir },
    { label: 'skill-help', command: [...cli, 'skill', '--help'], iterations, cwd: rootDir },
    { label: 'agent-help', command: [...cli, 'agent', '--help'], iterations, cwd: rootDir },
    { label: 'channel-help', command: [...cli, 'channel', '--help'], iterations, cwd: rootDir },
    { label: 'docs-help', command: [...cli, 'docs', '--help'], iterations, cwd: rootDir },
  ];

  return {
    cases: [
      ...helpCases,
      { label: 'lint', command: [...cli, 'lint'], iterations, cwd: rootDir },
      { label: 'agent-list-json', command: [...cli, 'agent', 'list', '--json'], iterations, cwd: tempRoot },
      {
        label: 'memory-search',
        command: [...cli, 'memory', 'search', '--query', 'startup performance', '--limit', '1'],
        iterations,
        cwd: tempRoot,
      },
    ],
    cleanup: () => {
      rmSync(tempRoot, { recursive: true, force: true });
    },
  };
}

export function resolveDefaultRootDir(moduleUrl: string): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), '../../../..');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const plan = createDefaultBenchmarkPlan({ rootDir: resolveDefaultRootDir(import.meta.url) });
  try {
    const results = runCliBenchmark(plan.cases);
    printBenchmarkResults(results);
    const gate = evaluateBenchmarkGate(results, {
      startupThresholdMs: Number.parseFloat(process.env.AI_DEVKIT_CLI_STARTUP_THRESHOLD_MS ?? '50'),
    });
    if (!gate.pass) {
      for (const failure of gate.failures) {
        console.error(failure);
      }
      process.exitCode = 1;
    }
  } finally {
    plan.cleanup();
  }
}
