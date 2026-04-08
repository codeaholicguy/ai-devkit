import { describe, expect, it } from '@jest/globals';
import * as path from 'path';
import { runBaseDocsRules } from '../../../../services/lint/rules/base-docs.rule';
import { LintDependencies } from '../../../../services/lint/types';

describe('base docs rule', () => {
  it('returns ok checks when all base docs exist', () => {
    const deps: LintDependencies = {
      cwd: () => '/repo',
      existsSync: () => true,
      execFileSync: () => ''
    };

    const checks = runBaseDocsRules('/repo', 'docs/ai', deps);

    expect(checks).toHaveLength(5);
    expect(checks.every(check => check.level === 'ok')).toBe(true);
  });

  it('uses custom docsDir for file paths', () => {
    const cwd = '/repo';
    const docsDir = '.ai-docs';
    const phases = ['requirements', 'design', 'planning', 'implementation', 'testing'];
    const existingPaths = new Set(
      phases.map(phase => path.join(cwd, docsDir, phase, 'README.md'))
    );
    const deps: LintDependencies = {
      cwd: () => cwd,
      existsSync: (p: string) => existingPaths.has(p),
      execFileSync: () => ''
    };

    const checks = runBaseDocsRules(cwd, docsDir, deps);

    expect(checks).toHaveLength(5);
    expect(checks.every(check => check.level === 'ok')).toBe(true);
    expect(checks[0].message).toBe('.ai-docs/requirements/README.md');
  });

  it('returns missing checks when base docs do not exist', () => {
    const deps: LintDependencies = {
      cwd: () => '/repo',
      existsSync: () => false,
      execFileSync: () => ''
    };

    const checks = runBaseDocsRules('/repo', 'docs/ai', deps);

    expect(checks).toHaveLength(5);
    expect(checks.every(check => check.level === 'miss')).toBe(true);
    expect(checks[0].fix).toBe('Run: npx ai-devkit@latest init');
  });
});
