import { describe, expect, it, beforeEach, afterEach, jest } from '@jest/globals';
import { ui } from '../../util/terminal-ui';
import { lintCommand, renderLintReport } from '../../commands/lint';
import { LintReport, runLintChecks } from '../../services/lint/lint.service';

jest.mock('../../services/lint/lint.service', () => ({
  runLintChecks: jest.fn()
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: {
    text: jest.fn(),
    breakline: jest.fn(),
    info: jest.fn(),
    success: jest.fn(),
    warning: jest.fn(),
    error: jest.fn(),
    spinner: jest.fn(),
    table: jest.fn(),
    summary: jest.fn()
  }
}));

describe('lint command', () => {
  const mockedRunLintChecks = runLintChecks as jest.MockedFunction<typeof runLintChecks>;
  const mockedUi = jest.mocked(ui);

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
  });

  afterEach(() => {
    process.exitCode = undefined;
  });

  it('runs checks, renders report, and sets exit code', async () => {
    const report: LintReport = {
      cwd: '/repo',
      checks: [],
      summary: { ok: 1, miss: 0, warn: 0, requiredFailures: 0 },
      pass: true,
      exitCode: 0
    };
    mockedRunLintChecks.mockReturnValue(report);

    await lintCommand({ feature: 'lint-command', json: true });

    expect(mockedRunLintChecks).toHaveBeenCalledWith({ feature: 'lint-command', json: true });
    expect(mockedUi.text).toHaveBeenCalledWith(JSON.stringify(report, null, 2));
    expect(process.exitCode).toBe(0);
  });

  it('propagates failure exit code from lint report', async () => {
    const report: LintReport = {
      cwd: '/repo',
      checks: [],
      summary: { ok: 0, miss: 1, warn: 0, requiredFailures: 1 },
      pass: false,
      exitCode: 1
    };
    mockedRunLintChecks.mockReturnValue(report);

    await lintCommand({});

    expect(process.exitCode).toBe(1);
    expect(mockedUi.text).toHaveBeenCalledWith('1 required check(s) failed.');
  });

  it('renders human-readable output by category', () => {
    const report: LintReport = {
      cwd: '/repo',
      feature: {
        raw: 'lint-command',
        normalizedName: 'lint-command',
        branchName: 'feature-lint-command'
      },
      checks: [
        { id: 'base', level: 'ok', category: 'base-docs', required: false, message: 'docs/ai/requirements/README.md' },
        { id: 'feature', level: 'miss', category: 'feature-docs', required: true, message: 'docs/ai/design/feature-lint-command.md' },
        { id: 'git', level: 'warn', category: 'git-worktree', required: false, message: 'No dedicated worktree registered' }
      ],
      summary: { ok: 1, miss: 1, warn: 1, requiredFailures: 1 },
      pass: false,
      exitCode: 1
    };

    renderLintReport(report, {});

    expect(mockedUi.text).toHaveBeenCalledWith('=== Base Structure ===');
    expect(mockedUi.text).toHaveBeenCalledWith('=== Feature: lint-command ===');
    expect(mockedUi.text).toHaveBeenCalledWith('=== Git: feature-lint-command ===');
    expect(mockedUi.text).toHaveBeenCalledWith('1 warning(s) reported.');
  });
});
