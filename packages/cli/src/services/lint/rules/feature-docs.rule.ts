import { DOCS_DIR, LIFECYCLE_PHASES } from '../constants';
import { LintCheckResult, LintDependencies } from '../types';
import { runPhaseDocRules } from './phase-docs.rule';

export function runFeatureDocsRules(
  cwd: string,
  normalizedName: string,
  deps: LintDependencies
): LintCheckResult[] {
  return runPhaseDocRules({
    cwd,
    phases: LIFECYCLE_PHASES,
    idPrefix: 'feature-doc',
    category: 'feature-docs',
    filePathForPhase: (phase: string) => `${DOCS_DIR}/${phase}/feature-${normalizedName}.md`,
    deps
  });
}
