import * as path from 'path';
import { LintCheckResult, LintDependencies } from '../types.js';
import { createMissingCheck, createOkCheck } from './check-factories.js';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function resolveFeatureDocPath(
  cwd: string,
  docsDir: string,
  phase: string,
  normalizedName: string,
  deps: LintDependencies
): string | null {
  const legacyPath = `${docsDir}/${phase}/feature-${normalizedName}.md`;

  const phaseDir = path.join(cwd, docsDir, phase);
  const datePrefixedPattern = new RegExp(
    `^\\d{4}-\\d{2}-\\d{2}-feature-${escapeRegex(normalizedName)}\\.md$`
  );

  if (deps.readdirSync) {
    try {
      const matchingFiles = deps.readdirSync(phaseDir)
        .filter(file => datePrefixedPattern.test(file))
        .sort()
        .reverse();
      const newestFile = matchingFiles[0];
      if (newestFile) {
        return `${docsDir}/${phase}/${newestFile}`;
      }
    } catch {
      // Fall through to legacy path check below.
    }
  }

  if (deps.existsSync(path.join(cwd, legacyPath))) {
    return legacyPath;
  }

  return null;
}

export function runFeatureDocsRules(
  cwd: string,
  docsDir: string,
  phases: readonly string[],
  normalizedName: string,
  deps: LintDependencies
): LintCheckResult[] {
  return phases.map((phase) => {
    const id = `feature-doc-${phase}`;
    const resolvedPath = resolveFeatureDocPath(cwd, docsDir, phase, normalizedName, deps);

    if (resolvedPath) {
      return createOkCheck(id, 'feature-docs', resolvedPath);
    }

    return createMissingCheck(
      id,
      'feature-docs',
      `${docsDir}/${phase}/YYYY-MM-DD-feature-${normalizedName}.md`,
      `Create ${docsDir}/${phase}/YYYY-MM-DD-feature-${normalizedName}.md`
    );
  });
}
