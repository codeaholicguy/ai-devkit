import { LIFECYCLE_PHASES } from '../constants';
import { LintCheckResult, LintDependencies } from '../types';
import { runPhaseDocRules } from './phase-docs.rule';

export function runBaseDocsRules(cwd: string, docsDir: string, deps: LintDependencies): LintCheckResult[] {
  return runPhaseDocRules({
    cwd,
    phases: LIFECYCLE_PHASES,
    idPrefix: 'base',
    category: 'base-docs',
    filePathForPhase: (phase: string) => `${docsDir}/${phase}/README.md`,
    missingFix: 'Run: npx ai-devkit@latest init',
    deps
  });
}
