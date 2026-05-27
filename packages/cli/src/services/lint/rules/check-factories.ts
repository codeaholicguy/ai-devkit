import { LintCheckResult } from '../types.js';
import { LINT_LEVEL } from '../constants.js';

export function createOkCheck(
  id: string,
  category: LintCheckResult['category'],
  message: string
): LintCheckResult {
  return {
    id,
    level: LINT_LEVEL.OK,
    category,
    required: false,
    message
  };
}

export function createMissingCheck(
  id: string,
  category: LintCheckResult['category'],
  message: string,
  fix?: string
): LintCheckResult {
  return {
    id,
    level: LINT_LEVEL.MISS,
    category,
    required: true,
    message,
    fix
  };
}

export function createWarnCheck(
  id: string,
  category: LintCheckResult['category'],
  message: string,
  fix?: string
): LintCheckResult {
  return {
    id,
    level: LINT_LEVEL.WARN,
    category,
    required: false,
    message,
    fix
  };
}
