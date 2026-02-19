import * as path from 'path';
import { DOCS_DIR, LIFECYCLE_PHASES } from '../constants';
import { LintCheckResult, LintDependencies } from '../types';
import { createMissingCheck, createOkCheck } from './check-factories';

export function runBaseDocsRules(cwd: string, deps: LintDependencies): LintCheckResult[] {
  const checks: LintCheckResult[] = [];

  for (const phase of LIFECYCLE_PHASES) {
    const templatePath = path.join(cwd, DOCS_DIR, phase, 'README.md');
    if (deps.existsSync(templatePath)) {
      checks.push(createOkCheck(`base-${phase}`, 'base-docs', `${DOCS_DIR}/${phase}/README.md`));
      continue;
    }

    checks.push(
      createMissingCheck(`base-${phase}`, 'base-docs', `${DOCS_DIR}/${phase}/README.md`, 'Run: npx ai-devkit init')
    );
  }

  return checks;
}
