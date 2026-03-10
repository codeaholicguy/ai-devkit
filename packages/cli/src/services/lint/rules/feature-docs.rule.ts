import { LIFECYCLE_PHASES } from '../constants';
import { LintCheckResult, LintDependencies } from '../types';
import { runPhaseDocRules } from './phase-docs.rule';

export function runFeatureDocsRules(
  cwd: string,
  docsDir: string,
  normalizedName: string,
  deps: LintDependencies
): LintCheckResult[] {
  return runPhaseDocRules({
    cwd,
    phases: LIFECYCLE_PHASES,
    idPrefix: 'feature-doc',
    category: 'feature-docs',
    filePathForPhase: (phase: string) => `${docsDir}/${phase}/feature-${normalizedName}.md`,
    deps
  });
}
