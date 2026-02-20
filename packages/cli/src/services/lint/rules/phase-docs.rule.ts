import * as path from 'path';
import { LintCheckResult, LintDependencies } from '../types';
import { createMissingCheck, createOkCheck } from './check-factories';

interface PhaseDocRuleParams {
  cwd: string;
  phases: readonly string[];
  idPrefix: string;
  category: LintCheckResult['category'];
  filePathForPhase: (phase: string) => string;
  missingFix?: string;
  deps: LintDependencies;
}

export function runPhaseDocRules(params: PhaseDocRuleParams): LintCheckResult[] {
  const checks: LintCheckResult[] = [];
  const { cwd, phases, idPrefix, category, filePathForPhase, missingFix, deps } = params;

  for (const phase of phases) {
    const relativePath = filePathForPhase(phase);
    const absolutePath = path.join(cwd, relativePath);
    const id = `${idPrefix}-${phase}`;

    if (deps.existsSync(absolutePath)) {
      checks.push(createOkCheck(id, category, relativePath));
      continue;
    }

    checks.push(createMissingCheck(id, category, relativePath, missingFix));
  }

  return checks;
}
