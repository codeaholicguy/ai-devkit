import { LintCheckResult } from '../types';

export function createOkCheck(
  id: string,
  category: LintCheckResult['category'],
  message: string
): LintCheckResult {
  return {
    id,
    level: 'ok',
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
    level: 'miss',
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
    level: 'warn',
    category,
    required: false,
    message,
    fix
  };
}
