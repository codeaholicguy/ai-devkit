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