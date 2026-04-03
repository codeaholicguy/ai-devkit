import { execSync, ExecSyncOptionsWithStringEncoding } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

const CLI_PATH = join(__dirname, '..', 'packages', 'cli', 'dist', 'cli.js');

export interface RunResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export function run(args: string, options: { cwd?: string; env?: Record<string, string> } = {}): RunResult {
  const execOptions: ExecSyncOptionsWithStringEncoding = {
    cwd: options.cwd || process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, ...options.env, NODE_NO_WARNINGS: '1' },
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
  execSync('git init', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.email "test@test.com"', { cwd: dir, stdio: 'ignore' });
  execSync('git config user.name "Test"', { cwd: dir, stdio: 'ignore' });
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
