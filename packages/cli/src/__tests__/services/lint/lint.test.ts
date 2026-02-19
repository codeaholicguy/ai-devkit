import { describe, expect, it } from '@jest/globals';
import { normalizeFeatureName, runLintChecks } from '../../../services/lint/lint.service';

describe('lint utilities', () => {
  it('normalizes feature names with optional feature- prefix', () => {
    expect(normalizeFeatureName('lint-command')).toBe('lint-command');
    expect(normalizeFeatureName('feature-lint-command')).toBe('lint-command');
  });

  it('fails when base docs are missing', () => {
    const report = runLintChecks({}, {
      cwd: () => '/repo',
      existsSync: () => false
    });

    expect(report.exitCode).toBe(1);
    expect(report.summary.requiredFailures).toBe(5);
    expect(report.checks.every(check => check.category === 'base-docs')).toBe(true);
  });

  it('passes with warning when branch exists but no dedicated worktree', () => {
    const report = runLintChecks(
      { feature: 'feature-sample' },
      {
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
      }
    );

    expect(report.exitCode).toBe(0);
    expect(report.pass).toBe(true);
    expect(report.summary.warn).toBeGreaterThan(0);
    expect(
      report.checks.some(check => check.category === 'git-worktree' && check.level === 'warn')
    ).toBe(true);
  });

  it('fails when feature branch does not exist', () => {
    const report = runLintChecks(
      { feature: 'sample' },
      {
        cwd: () => '/repo',
        existsSync: () => true,
        execFileSync: (_file: string, args: readonly string[]) => {
          const cmd = args.join(' ');
          if (cmd.startsWith('rev-parse')) {
            return 'true\n';
          }

          if (cmd.startsWith('show-ref')) {
            throw new Error('missing branch');
          }

          return '';
        }
      }
    );

    expect(report.exitCode).toBe(1);
    expect(report.pass).toBe(false);
    expect(
      report.checks.some(check => check.category === 'git-worktree' && check.level === 'miss')
    ).toBe(true);
  });

  it('reports non-git directory as required failure for feature lint', () => {
    const report = runLintChecks(
      { feature: 'sample' },
      {
        cwd: () => '/repo',
        existsSync: () => true,
        execFileSync: (_file: string, args: readonly string[]) => {
          const cmd = args.join(' ');
          if (cmd.startsWith('rev-parse')) {
            throw new Error('not a git repo');
          }

          return '';
        }
      }
    );

    expect(report.exitCode).toBe(1);
    expect(
      report.checks.some(
        check => check.category === 'git-worktree' && check.level === 'miss' && check.required
      )
    ).toBe(true);
  });

  it('fails fast for invalid feature names', () => {
    const report = runLintChecks({ feature: 'bad name;rm -rf /' }, {
      cwd: () => '/repo',
      existsSync: () => true
    });

    expect(report.exitCode).toBe(1);
    expect(report.checks.some(check => check.id === 'feature-name' && check.level === 'miss')).toBe(true);
  });

});
