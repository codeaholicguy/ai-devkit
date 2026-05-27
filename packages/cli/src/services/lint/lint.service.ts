import * as fs from 'fs';
import { execFileSync } from 'child_process';
import { DEFAULT_DOCS_DIR, DEFAULT_PHASES, Phase } from '../../types.js';
import { LINT_LEVEL } from './constants.js';
import { runBaseDocsRules } from './rules/base-docs.rule.js';
import { runFeatureDocsRules } from './rules/feature-docs.rule.js';
import { validateFeatureNameRule, normalizeFeatureName } from './rules/feature-name.rule.js';
import { runGitWorktreeRules } from './rules/git-worktree.rule.js';
import { FeatureTarget, LintCheckResult, LintDependencies, LintOptions, LintReport } from './types.js';

const defaultDependencies: LintDependencies = {
  cwd: () => process.cwd(),
  existsSync: (targetPath: string) => fs.existsSync(targetPath),
  readdirSync: (targetPath: string) => fs.readdirSync(targetPath),
  execFileSync: (file: string, args: readonly string[], options?: { cwd?: string; stdio?: 'ignore' | 'pipe'; encoding?: BufferEncoding }) =>
    execFileSync(file, args, options)
};

export { normalizeFeatureName };
export type { LintOptions, LintLevel, LintCheckResult, LintReport, LintDependencies } from './types.js';

export function runLintChecks(
  options: LintOptions,
  docsDir: string = DEFAULT_DOCS_DIR,
  phasesOrDependencies: readonly Phase[] | Partial<LintDependencies> = DEFAULT_PHASES,
  dependencies: Partial<LintDependencies> = {}
): LintReport {
  const phases = Array.isArray(phasesOrDependencies) ? phasesOrDependencies : DEFAULT_PHASES;
  const providedDependencies = Array.isArray(phasesOrDependencies) ? dependencies : phasesOrDependencies;
  const deps: LintDependencies = {
    ...defaultDependencies,
    ...providedDependencies
  };

  const cwd = deps.cwd();
  const checks: LintCheckResult[] = [];

  checks.push(...runBaseDocsRules(cwd, docsDir, phases, deps));

  if (!options.feature) {
    return finalizeReport(cwd, checks);
  }

  return runFeatureChecks(cwd, docsDir, phases, checks, options.feature, deps);
}

function runFeatureChecks(
  cwd: string,
  docsDir: string,
  phases: readonly Phase[],
  checks: LintCheckResult[],
  rawFeature: string,
  deps: LintDependencies
): LintReport {
  const featureValidation = validateFeatureNameRule(rawFeature);
  if (featureValidation.check) {
    checks.push(featureValidation.check);
    return finalizeReport(cwd, checks, featureValidation.target);
  }

  checks.push(...runFeatureDocsRules(cwd, docsDir, phases, featureValidation.target.normalizedName, deps));
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
