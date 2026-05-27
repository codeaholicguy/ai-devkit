
import type { MockedFunction } from 'vitest';
import { ui } from '../../util/terminal-ui.js';
import { lintCommand, renderLintReport } from '../../commands/lint.js';
import { LintReport, runLintChecks } from '../../services/lint/lint.service.js';

vi.mock('../../lib/Config.js', () => ({
  ConfigManager: vi.fn(() => ({
    getDocsDir: vi.fn<() => Promise<string>>().mockResolvedValue('docs/ai'),
    getPhases: vi.fn<() => Promise<string[]>>().mockResolvedValue(['requirements', 'design'])
  }))
}));

vi.mock('../../services/lint/lint.service.js', () => ({
  runLintChecks: vi.fn()
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    text: vi.fn(),
    breakline: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
    error: vi.fn(),
    spinner: vi.fn(),
    table: vi.fn(),
    summary: vi.fn()
  }
}));

describe('lint command', () => {
  const mockedRunLintChecks = runLintChecks as MockedFunction<typeof runLintChecks>;
  const mockedUi = vi.mocked(ui);

  beforeEach(() => {
    vi.clearAllMocks();
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

    expect(mockedRunLintChecks).toHaveBeenCalledWith(
      { feature: 'lint-command', json: true },
      'docs/ai',
      ['requirements', 'design']
    );
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
