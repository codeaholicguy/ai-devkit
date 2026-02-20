import {
  getWorktreePathsForBranchSync,
  isInsideGitWorkTreeSync,
  localBranchExistsSync
} from '../../../util/git';
import { LintCheckResult, LintDependencies } from '../types';
import { createMissingCheck, createOkCheck, createWarnCheck } from './check-factories';

export function runGitWorktreeRules(
  cwd: string,
  branchName: string,
  deps: LintDependencies
): LintCheckResult[] {
  const checks: LintCheckResult[] = [];

  if (!isInsideGitWorkTreeSync(cwd, deps.execFileSync)) {
    checks.push(
      createMissingCheck(
        'git-repo',
        'git-worktree',
        'Current directory is not inside a git repository',
        'Run lint --feature from the repository root or a repo worktree.'
      )
    );
    return checks;
  }

  const branchExists = localBranchExistsSync(cwd, branchName, deps.execFileSync);
  if (!branchExists) {
    checks.push(
      createMissingCheck(
        'git-branch',
        'git-worktree',
        `Branch ${branchName} does not exist`,
        `Run: git worktree add -b ${branchName} ../${branchName}`
      )
    );
    return checks;
  }

  checks.push(createOkCheck('git-branch', 'git-worktree', `Branch ${branchName} exists`));

  const worktreePaths = getWorktreePathsForBranchSync(cwd, branchName, deps.execFileSync);
  if (worktreePaths.length === 0) {
    checks.push(
      createWarnCheck(
        'git-worktree',
        'git-worktree',
        `No dedicated worktree registered for ${branchName}`,
        `Suggested: git worktree add ../${branchName} ${branchName}`
      )
    );
    return checks;
  }

  checks.push(
    createOkCheck('git-worktree', 'git-worktree', `Worktree detected for ${branchName}: ${worktreePaths.join(', ')}`)
  );

  return checks;
}
