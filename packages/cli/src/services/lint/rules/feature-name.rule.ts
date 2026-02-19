import { FEATURE_NAME_PATTERN } from '../constants';
import { LintCheckResult } from '../types';
import { createMissingCheck } from './check-factories';

export interface FeatureTarget {
  raw: string;
  normalizedName: string;
  branchName: string;
}

export function normalizeFeatureName(input: string): string {
  const trimmed = input.trim();
  return trimmed.startsWith('feature-') ? trimmed.slice('feature-'.length) : trimmed;
}

export function validateFeatureNameRule(rawFeature: string): {
  target: FeatureTarget;
  check?: LintCheckResult;
} {
  const normalizedName = normalizeFeatureName(rawFeature);
  const target: FeatureTarget = {
    raw: rawFeature,
    normalizedName,
    branchName: `feature-${normalizedName}`
  };

  if (FEATURE_NAME_PATTERN.test(normalizedName)) {
    return { target };
  }

  return {
    target,
    check: createMissingCheck(
      'feature-name',
      'feature-docs',
      `Invalid feature name: ${rawFeature}`,
      'Use kebab-case and optionally prefix with feature- (example: lint-command or feature-lint-command).'
    )
  };
}
