import { GitExecFileSync } from '../../util/git';

export interface LintOptions {
  feature?: string;
  json?: boolean;
}

export type LintLevel = 'ok' | 'miss' | 'warn';

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
  feature?: {
    raw: string;
    normalizedName: string;
    branchName: string;
  };
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

export interface LintDependencies {
  cwd: () => string;
  existsSync: (targetPath: string) => boolean;
  execFileSync: GitExecFileSync;
}
