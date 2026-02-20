import { describe, expect, it } from '@jest/globals';
import { normalizeFeatureName, validateFeatureNameRule } from '../../../../services/lint/rules/feature-name.rule';

describe('feature name rule', () => {
  it('normalizes optional feature- prefix', () => {
    expect(normalizeFeatureName('feature-lint-command')).toBe('lint-command');
    expect(normalizeFeatureName('lint-command')).toBe('lint-command');
  });

  it('returns no validation check for valid names', () => {
    const result = validateFeatureNameRule('feature-lint-command');

    expect(result.check).toBeUndefined();
    expect(result.target.branchName).toBe('feature-lint-command');
  });

  it('returns missing check for invalid names', () => {
    const result = validateFeatureNameRule('lint command');

    expect(result.check?.id).toBe('feature-name');
    expect(result.check?.level).toBe('miss');
  });
});
