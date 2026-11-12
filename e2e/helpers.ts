import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CLI_PATH = join(__dirname, '..', 'packages', 'cli', 'dist', 'cli.js');

// Allowlist, not passthrough: inherited GIT_* (e.g. under a git hook) would
// point git at the parent repo. Tests pass anything else via options.env.
const ENV_ALLOWLIST = [
  'PATH',
  'HOME',
  'TMPDIR',
  'LANG',
  'LC_ALL',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'NODE_EXTRA_CA_CERTS',
  'SSL_CERT_FILE'
];

export function baseEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of ENV_ALLOWLIST) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  return env;
}

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function run(args: string, options: { cwd?: string; env?: Record<string, string> } = {}): RunResult {
  const execOptions: ExecSyncOptionsWithStringEncoding = {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    env: { ...baseEnv(), ...options.env, NODE_NO_WARNINGS: '1' },
    timeout: 20000
  };

  try {
    const stdout = execSync(`node "${CLI_PATH}" ${args}`, execOptions);
    return { stdout: stdout || '', stderr: '', exitCode: 0 };
  } catch (error: unknown) {
    const e = error as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: e.stdout || '',
      stderr: e.stderr || '',
      exitCode: e.status ?? 1
    };
  }
}

export function createTempProject(): string {
  const dir = mkdtempSync(join(tmpdir(), 'ai-devkit-e2e-'));
  const gitOptions = { cwd: dir, stdio: 'ignore' as const, env: baseEnv() };
  execSync('git init', gitOptions);
  execSync('git config user.email "test@test.com"', gitOptions);
  execSync('git config user.name "Test"', gitOptions);
  return dir;
}

export function cleanupTempProject(dir: string): void {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors
  }
}

export function writeConfigFile(dir: string, config: Record<string, unknown>): void {
  writeFileSync(join(dir, '.ai-devkit.json'), JSON.stringify(config, null, 2));
}
