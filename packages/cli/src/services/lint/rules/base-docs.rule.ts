import { DOCS_DIR, LIFECYCLE_PHASES } from '../constants';
import { LintCheckResult, LintDependencies } from '../types';
import { runPhaseDocRules } from './phase-docs.rule';

export function runBaseDocsRules(cwd: string, deps: LintDependencies): LintCheckResult[] {
  return runPhaseDocRules({
    cwd,
    phases: LIFECYCLE_PHASES,
    idPrefix: 'base',
    category: 'base-docs',
    filePathForPhase: (phase: string) => `${DOCS_DIR}/${phase}/README.md`,
    missingFix: 'Run: npx ai-devkit@latest init',
    deps
  });
}
