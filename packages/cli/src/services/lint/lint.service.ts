import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { LINT_LEVEL } from './constants';
import { runBaseDocsRules } from './rules/base-docs.rule';
import { runFeatureDocsRules } from './rules/feature-docs.rule';
import { validateFeatureNameRule, normalizeFeatureName } from './rules/feature-name.rule';
import { runGitWorktreeRules } from './rules/git-worktree.rule';
import { FeatureTarget, LintCheckResult, LintDependencies, LintOptions, LintReport } from './types';

const defaultDependencies: LintDependencies = {
  cwd: () => process.cwd(),
  existsSync: (targetPath: string) => fs.existsSync(targetPath),
  execFileSync: (file: string, args: readonly string[], options?: { cwd?: string; stdio?: 'ignore' | 'pipe'; encoding?: BufferEncoding }) =>
    execFileSync(file, args, options)
};

export { normalizeFeatureName };
export type { LintOptions, LintLevel, LintCheckResult, LintReport, LintDependencies } from './types';

export function runLintChecks(
  options: LintOptions,
  dependencies: Partial<LintDependencies> = {}
): LintReport {
  const deps: LintDependencies = {
    ...defaultDependencies,
    ...dependencies
  };

  const cwd = deps.cwd();
  const checks: LintCheckResult[] = [];

  checks.push(...runBaseDocsRules(cwd, deps));

  if (!options.feature) {
    return finalizeReport(cwd, checks);
  }

  return runFeatureChecks(cwd, checks, options.feature, deps);
}

function runFeatureChecks(
  cwd: string,
  checks: LintCheckResult[],
  rawFeature: string,
  deps: LintDependencies
): LintReport {
  const featureValidation = validateFeatureNameRule(rawFeature);
  if (featureValidation.check) {
    checks.push(featureValidation.check);
    return finalizeReport(cwd, checks, featureValidation.target);
  }

  checks.push(...runFeatureDocsRules(cwd, featureValidation.target.normalizedName, deps));
  checks.push(...runGitWorktreeRules(cwd, featureValidation.target.branchName, deps));

  return finalizeReport(cwd, checks, featureValidation.target);
}

function finalizeReport(
  cwd: string,
  checks: LintCheckResult[],
  feature?: FeatureTarget
): LintReport {
  const summary = checks.reduce(
    (acc, check) => {
      if (check.level === LINT_LEVEL.OK) {
        acc.ok += 1;
      }

      if (check.level === LINT_LEVEL.MISS) {
        acc.miss += 1;
        if (check.required) {
          acc.requiredFailures += 1;
        }
      }

      if (check.level === LINT_LEVEL.WARN) {
        acc.warn += 1;
      }

      return acc;
    },
    { ok: 0, miss: 0, warn: 0, requiredFailures: 0 }
  );

  const pass = summary.requiredFailures === 0;

  return {
    cwd,
    feature,
    checks,
    summary,
    pass,
    exitCode: pass ? 0 : 1
  };
}
