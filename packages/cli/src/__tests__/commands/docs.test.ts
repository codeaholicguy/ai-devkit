import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { Command } from 'commander';
import { registerDocsCommand } from '../../commands/docs';
import { ui } from '../../util/terminal-ui';

const mockGetDocsDir = jest.fn<() => Promise<string>>();
const mockGetPhases = jest.fn<() => Promise<string[]>>();
const mockCopyFeatureDocTemplates = jest.fn<(...args: unknown[]) => Promise<any>>();
const mockTemplateManagerConstructor = jest.fn();

jest.mock('../../lib/Config', () => ({
  ConfigManager: jest.fn(() => ({
    getDocsDir: mockGetDocsDir,
    getPhases: mockGetPhases
  }))
}));

jest.mock('../../lib/TemplateManager', () => ({
  TemplateManager: jest.fn((...args: unknown[]) => {
    mockTemplateManagerConstructor(...args);
    return {
      copyFeatureDocTemplates: (...copyArgs: unknown[]) => mockCopyFeatureDocTemplates(...copyArgs)
    };
  })
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: {
    error: jest.fn(),
    success: jest.fn(),
    text: jest.fn()
  }
}));

describe('docs command', () => {
  const mockedUi = jest.mocked(ui);

  beforeEach(() => {
    jest.clearAllMocks();
    process.exitCode = undefined;
    mockGetDocsDir.mockResolvedValue('docs/ai');
    mockGetPhases.mockResolvedValue(['requirements', 'design']);
    mockCopyFeatureDocTemplates.mockResolvedValue([
      {
        phase: 'requirements',
        path: '/repo/docs/ai/requirements/2026-05-25-feature-sample.md',
        relativePath: 'docs/ai/requirements/2026-05-25-feature-sample.md'
      }
    ]);
  });

  afterEach(() => {
    jest.useRealTimers();
    process.exitCode = undefined;
  });

  it('registers docs init-feature and creates docs using config docsDir', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 25, 10, 30));
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'sample']);

    expect(mockCopyFeatureDocTemplates).toHaveBeenCalledWith('sample', {
      date: '2026-05-25',
      phases: ['requirements', 'design']
    });
    expect(mockedUi.success).toHaveBeenCalledWith('Created 1 feature doc(s) for sample.');
    expect(mockedUi.text).toHaveBeenCalledWith('docs/ai/requirements/2026-05-25-feature-sample.md');
  });

  it('uses the current local date', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 25, 10, 30));
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'sample']);

    expect(mockCopyFeatureDocTemplates).toHaveBeenCalledWith('sample', {
      date: '2026-05-25',
      phases: ['requirements', 'design']
    });
  });

  it('prints JSON output when requested', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 25, 10, 30));
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'feature-sample', '--json']);

    expect(mockedUi.text).toHaveBeenCalledWith(JSON.stringify({
      feature: 'sample',
      date: '2026-05-25',
      docsDir: 'docs/ai',
      files: [
        {
          phase: 'requirements',
          path: 'docs/ai/requirements/2026-05-25-feature-sample.md'
        }
      ]
    }, null, 2));
    expect(mockedUi.success).not.toHaveBeenCalled();
  });

  it('fails with a clear message for invalid feature names', async () => {
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'bad name']);

    expect(process.exitCode).toBe(1);
    expect(mockCopyFeatureDocTemplates).not.toHaveBeenCalled();
    expect(mockedUi.error).toHaveBeenCalledWith('Invalid feature name: bad name');
  });

  it('surfaces copy errors and sets a non-zero exit code', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 4, 25, 10, 30));
    mockCopyFeatureDocTemplates.mockRejectedValue(new Error('Feature docs already exist'));
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'sample']);

    expect(process.exitCode).toBe(1);
    expect(mockedUi.error).toHaveBeenCalledWith('Feature docs already exist');
  });
});
