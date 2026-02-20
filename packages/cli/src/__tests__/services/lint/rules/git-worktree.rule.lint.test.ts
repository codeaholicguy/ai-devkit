import { describe, expect, it } from '@jest/globals';
import { runGitWorktreeRules } from '../../../../services/lint/rules/git-worktree.rule';
import { LintDependencies } from '../../../../services/lint/types';

describe('git worktree rule', () => {
  it('returns required failure when not in git repo', () => {
    const deps: LintDependencies = {
      cwd: () => '/repo',
      existsSync: () => true,
      execFileSync: (_file: string, args: readonly string[]) => {
        if (args[0] === 'rev-parse') {
          throw new Error('not git');
        }
        return '';
      }
    };

    const checks = runGitWorktreeRules('/repo', 'feature-sample', deps);

    expect(checks).toHaveLength(1);
    expect(checks[0].id).toBe('git-repo');
    expect(checks[0].required).toBe(true);
  });

  it('returns warning when branch exists and dedicated worktree is missing', () => {
    const deps: LintDependencies = {
      cwd: () => '/repo',
      existsSync: () => true,
      execFileSync: (_file: string, args: readonly string[]) => {
        const cmd = args.join(' ');
        if (cmd.startsWith('rev-parse')) {
          return 'true\n';
        }
        if (cmd.startsWith('show-ref')) {
          return '';
        }
        if (cmd.startsWith('worktree list --porcelain')) {
          return 'worktree /repo\nbranch refs/heads/main\n\n';
        }
        return '';
      }
    };

    const checks = runGitWorktreeRules('/repo', 'feature-sample', deps);

    expect(checks[0].id).toBe('git-branch');
    expect(checks[1].id).toBe('git-worktree');
    expect(checks[1].level).toBe('warn');
  });
});
