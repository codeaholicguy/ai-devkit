import { GitExecFileSync } from '../../util/git';
import { LINT_LEVEL } from './constants';

export interface LintOptions {
  feature?: string;
  json?: boolean;
}

export type LintLevel = (typeof LINT_LEVEL)[keyof typeof LINT_LEVEL];

export interface LintCheckResult {
  id: string;
  level: LintLevel;
  category: 'base-docs' | 'feature-docs' | 'git-worktree';
  required: boolean;
  message: string;
  fix?: string;
}

export interface LintReport {
  cwd: string;
  feature?: FeatureTarget;
  checks: LintCheckResult[];
  summary: {
    ok: number;
    miss: number;
    warn: number;
    requiredFailures: number;
  };
  pass: boolean;
  exitCode: 0 | 1;
}

export interface FeatureTarget {
  raw: string;
  normalizedName: string;
  branchName: string;
}

export interface LintDependencies {
  cwd: () => string;
  existsSync: (targetPath: string) => boolean;
  execFileSync: GitExecFileSync;
}
