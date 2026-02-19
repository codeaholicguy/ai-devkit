import * as path from 'path';
import { DOCS_DIR, LIFECYCLE_PHASES } from '../constants';
import { LintCheckResult, LintDependencies } from '../types';
import { createMissingCheck, createOkCheck } from './check-factories';

export function runFeatureDocsRules(
  cwd: string,
  normalizedName: string,
  deps: LintDependencies
): LintCheckResult[] {
  const checks: LintCheckResult[] = [];

  for (const phase of LIFECYCLE_PHASES) {
    const featureDocPath = path.join(cwd, DOCS_DIR, phase, `feature-${normalizedName}.md`);
    if (deps.existsSync(featureDocPath)) {
      checks.push(
        createOkCheck(
          `feature-doc-${phase}`,
          'feature-docs',
          `${DOCS_DIR}/${phase}/feature-${normalizedName}.md`
        )
      );
      continue;
    }

    checks.push(
      createMissingCheck(
        `feature-doc-${phase}`,
        'feature-docs',
        `${DOCS_DIR}/${phase}/feature-${normalizedName}.md`
      )
    );
  }

  return checks;
}
