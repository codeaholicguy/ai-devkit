import { describe, expect, it } from '@jest/globals';
import { runBaseDocsRules } from '../../../../services/lint/rules/base-docs.rule';
import { LintDependencies } from '../../../../services/lint/types';

describe('base docs rule', () => {
  it('returns ok checks when all base docs exist', () => {
    const deps: LintDependencies = {
      cwd: () => '/repo',
      existsSync: () => true,
      execFileSync: () => ''
    };

    const checks = runBaseDocsRules('/repo', deps);

    expect(checks).toHaveLength(5);
    expect(checks.every(check => check.level === 'ok')).toBe(true);
  });

  it('returns missing checks when base docs do not exist', () => {
    const deps: LintDependencies = {
      cwd: () => '/repo',
      existsSync: () => false,
      execFileSync: () => ''
    };

    const checks = runBaseDocsRules('/repo', deps);

    expect(checks).toHaveLength(5);
    expect(checks.every(check => check.level === 'miss')).toBe(true);
    expect(checks[0].fix).toBe('Run: npx ai-devkit@latest init');
  });
});
