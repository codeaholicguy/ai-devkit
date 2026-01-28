import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';

const execAsync = promisify(exec);

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