import { DEFAULT_PHASES } from '../../../types.js';
import { LintCheckResult, LintDependencies } from '../types.js';
import { runPhaseDocRules } from './phase-docs.rule.js';

function isPhaseList(value: readonly string[] | LintDependencies): value is readonly string[] {
  return Array.isArray(value);
}

export function runBaseDocsRules(
  cwd: string,
  docsDir: string,
  phasesOrDeps: readonly string[] | LintDependencies,
  maybeDeps?: LintDependencies
): LintCheckResult[] {
  let phases: readonly string[];
  let deps: LintDependencies | undefined;

  if (isPhaseList(phasesOrDeps)) {
    phases = phasesOrDeps;
    deps = maybeDeps;
  } else {
    phases = DEFAULT_PHASES;
    deps = phasesOrDeps;
  }

  if (deps === undefined) {
    throw new Error('Lint dependencies are required');
  }

  return runPhaseDocRules({
    cwd,
    phases,
    idPrefix: 'base',
    category: 'base-docs',
    filePathForPhase: (phase: string) => `${docsDir}/${phase}/README.md`,
    missingFix: 'Run: npx ai-devkit@latest init',
    deps
  });
}
