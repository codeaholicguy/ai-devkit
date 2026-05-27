
import { normalizeFeatureName, runLintChecks } from '../../../services/lint/lint.service.js';

describe('lint service', () => {
  it('normalizes feature names with optional feature- prefix', () => {
    expect(normalizeFeatureName('lint-command')).toBe('lint-command');
    expect(normalizeFeatureName('feature-lint-command')).toBe('lint-command');
  });

  it('fails when base docs are missing', () => {
    const report = runLintChecks({}, undefined, {
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
      undefined,
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
      undefined,
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
      undefined,
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

  it('uses custom docsDir from options', () => {
    const existingPaths = new Set([
      '/repo/custom-docs/requirements/README.md',
      '/repo/custom-docs/design/README.md',
      '/repo/custom-docs/planning/README.md',
      '/repo/custom-docs/implementation/README.md',
      '/repo/custom-docs/testing/README.md',
    ]);

    const report = runLintChecks({}, 'custom-docs', ['requirements', 'design'], {
      cwd: () => '/repo',
      existsSync: (p: string) => existingPaths.has(p)
    });

    expect(report.exitCode).toBe(0);
    expect(report.pass).toBe(true);
    expect(report.checks.every(check => check.message.startsWith('custom-docs/'))).toBe(true);
  });

  it('uses configured phases for base and feature docs', () => {
    const existingPaths = new Set([
      '/repo/docs/ai/requirements/README.md',
      '/repo/docs/ai/deployment/README.md',
      '/repo/docs/ai/requirements/2026-05-25-feature-sample.md',
      '/repo/docs/ai/deployment/2026-05-25-feature-sample.md',
    ]);

    const report = runLintChecks(
      { feature: 'sample' },
      undefined,
      ['requirements', 'deployment'],
      {
        cwd: () => '/repo',
        existsSync: (p: string) => existingPaths.has(p),
        readdirSync: (p: string) => Array.from(existingPaths)
          .filter(existingPath => existingPath.startsWith(`${p}/`))
          .map(existingPath => existingPath.slice(p.length + 1)),
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
    expect(report.checks.filter(check => check.category === 'base-docs')).toHaveLength(2);
    expect(report.checks.filter(check => check.category === 'feature-docs')).toHaveLength(2);
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'feature-doc-deployment',
        level: 'ok',
        message: 'docs/ai/deployment/2026-05-25-feature-sample.md'
      })
    );
  });

  it('falls back to default docs/ai when docsDir is not provided', () => {
    const report = runLintChecks({}, undefined, {
      cwd: () => '/repo',
      existsSync: () => false
    });

    expect(report.checks.every(check => check.message.startsWith('docs/ai/'))).toBe(true);
  });

  it('fails fast for invalid feature names', () => {
    const report = runLintChecks({ feature: 'bad name;rm -rf /' }, undefined, {
      cwd: () => '/repo',
      existsSync: () => true
    });

    expect(report.exitCode).toBe(1);
    expect(report.checks.some(check => check.id === 'feature-name' && check.level === 'miss')).toBe(true);
  });

  it('accepts date-prefixed feature documentation and reports the newest matching file', () => {
    const existingPaths = new Set([
      '/repo/docs/ai/requirements/README.md',
      '/repo/docs/ai/design/README.md',
      '/repo/docs/ai/planning/README.md',
      '/repo/docs/ai/implementation/README.md',
      '/repo/docs/ai/testing/README.md',
      '/repo/docs/ai/requirements/2026-03-01-feature-sample.md',
      '/repo/docs/ai/requirements/2026-03-10-feature-sample.md',
      '/repo/docs/ai/design/2026-03-10-feature-sample.md',
      '/repo/docs/ai/planning/2026-03-10-feature-sample.md',
      '/repo/docs/ai/implementation/2026-03-10-feature-sample.md',
      '/repo/docs/ai/testing/2026-03-10-feature-sample.md',
    ]);

    const report = runLintChecks(
      { feature: 'sample' },
      undefined,
      {
        cwd: () => '/repo',
        existsSync: (p: string) => existingPaths.has(p),
        readdirSync: (p: string) => Array.from(existingPaths)
          .filter(existingPath => existingPath.startsWith(`${p}/`))
          .map(existingPath => existingPath.slice(p.length + 1)),
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
    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'feature-doc-requirements',
        level: 'ok',
        message: 'docs/ai/requirements/2026-03-10-feature-sample.md'
      })
    );
  });

  it('prefers the latest date-prefixed feature doc over a legacy feature doc', () => {
    const existingPaths = new Set([
      '/repo/docs/ai/requirements/README.md',
      '/repo/docs/ai/requirements/feature-sample.md',
      '/repo/docs/ai/requirements/2026-05-25-feature-sample.md',
    ]);

    const report = runLintChecks(
      { feature: 'sample' },
      undefined,
      ['requirements'],
      {
        cwd: () => '/repo',
        existsSync: (p: string) => existingPaths.has(p),
        readdirSync: (p: string) => Array.from(existingPaths)
          .filter(existingPath => existingPath.startsWith(`${p}/`))
          .map(existingPath => existingPath.slice(p.length + 1)),
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

    expect(report.checks).toContainEqual(
      expect.objectContaining({
        id: 'feature-doc-requirements',
        level: 'ok',
        message: 'docs/ai/requirements/2026-05-25-feature-sample.md'
      })
    );
  });

});
