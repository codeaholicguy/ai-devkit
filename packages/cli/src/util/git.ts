import { exec, execFileSync } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';

const execAsync = promisify(exec);
export type GitExecFileSync = (
  file: string,
  args: readonly string[],
  options?: { cwd?: string; stdio?: 'ignore' | 'pipe'; encoding?: BufferEncoding }
) => string | Buffer;

const defaultExecFileSync: GitExecFileSync = (
  file: string,
  args: readonly string[],
  options?: { cwd?: string; stdio?: 'ignore' | 'pipe'; encoding?: BufferEncoding }
) => execFileSync(file, args, options);

/**
 * Checks if git is installed and available in PATH
 * @throws Error if git is not installed
 */
export async function ensureGitInstalled(): Promise<void> {
  try {
    await execAsync('git --version');
  } catch {
    throw new Error(
      'Git is not installed or not in PATH. Please install Git: https://git-scm.com/downloads'
    );
  }
}

/**
 * Clones a repository to the specified directory
 * @param targetDir - Target directory for the clone
 * @param repoName - Name of the repository
 * @param gitUrl - Git URL to clone from
 * @returns Path to cloned repository
 * @throws Error if clone fails or times out
 */
export async function cloneRepository(targetDir: string, repoName: string, gitUrl: string): Promise<string> {
  const repoPath = path.join(targetDir, repoName);

  if (await fs.pathExists(repoPath)) {
    console.log(`  → ${targetDir}/${repoName} (already exists, skipped)`);
    return repoPath;
  }

  console.log(`  → Cloning ${repoName} (this may take a moment)...`);
  await fs.ensureDir(path.dirname(repoPath));

  try {
    await execAsync(`git clone --depth 1 --single-branch "${gitUrl}" "${repoPath}"`, {
      timeout: 60000,
    });
    console.log('  → Clone complete');
    return repoPath;
  } catch (error: any) {
    throw new Error(`Git clone failed: ${error.message}. Check network and git installation.`);
  }
}

/**
 * Checks if a directory is a git repository
 * @param dirPath - Absolute path to directory
 * @returns true if .git directory exists
 */
export async function isGitRepository(dirPath: string): Promise<boolean> {
  const gitDir = path.join(dirPath, '.git');
  return await fs.pathExists(gitDir);
}

/**
 * Pulls latest changes for a git repository
 * @param repoPath - Absolute path to git repository
 * @throws Error if git pull fails
 */
export async function pullRepository(repoPath: string): Promise<void> {
  try {
    await execAsync('git pull', {
      cwd: repoPath,
      timeout: 60000,
    });
  } catch (error: any) {
    const message = error.message || 'Unknown error';
    throw new Error(`Git pull failed: ${message}`);
  }
}

/**
 * Fetch the current HEAD SHA for a git repository using git ls-remote
 * @param gitUrl - Git repository URL
 * @returns HEAD SHA hash
 * @throws Error if fetch fails or cannot parse output
 */
export async function fetchGitHead(gitUrl: string): Promise<string> {
  try {
    const { stdout } = await execAsync(`git ls-remote ${gitUrl} HEAD`);
    const match = stdout.trim().match(/^([a-f0-9]+)\s+HEAD$/m);

    if (!match) {
      throw new Error('Could not parse HEAD from ls-remote output');
    }

    return match[1];
  } catch (error: any) {
    throw new Error(`Failed to fetch git HEAD: ${error.message}`);
  }
}

function normalizeExecResult(result: string | Buffer): string {
  return Buffer.isBuffer(result) ? result.toString('utf8').trim() : result.trim();
}

export function isInsideGitWorkTreeSync(cwd: string, execFileSyncFn: GitExecFileSync = defaultExecFileSync): boolean {
  try {
    const result = execFileSyncFn('git', ['rev-parse', '--is-inside-work-tree'], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    return normalizeExecResult(result) === 'true';
  } catch {
    return false;
  }
}

export function localBranchExistsSync(
  cwd: string,
  branchName: string,
  execFileSyncFn: GitExecFileSync = defaultExecFileSync
): boolean {
  try {
    execFileSyncFn('git', ['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`], {
      cwd,
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

export function getWorktreePathsForBranchSync(
  cwd: string,
  branchName: string,
  execFileSyncFn: GitExecFileSync = defaultExecFileSync
): string[] {
  try {
    const raw = execFileSyncFn('git', ['worktree', 'list', '--porcelain'], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8'
    });

    const output = normalizeExecResult(raw);
    const lines = output.split('\n');
    const matches: string[] = [];

    let currentPath = '';
    let currentBranch = '';

    for (const line of lines) {
      if (!line.trim()) {
        if (currentBranch === `refs/heads/${branchName}` && currentPath) {
          matches.push(currentPath);
        }
        currentPath = '';
        currentBranch = '';
        continue;
      }

      if (line.startsWith('worktree ')) {
        currentPath = line.slice('worktree '.length).trim();
      }

      if (line.startsWith('branch ')) {
        currentBranch = line.slice('branch '.length).trim();
      }
    }

    if (currentBranch === `refs/heads/${branchName}` && currentPath) {
      matches.push(currentPath);
    }

    return matches;
  } catch {
    return [];
  }
}
