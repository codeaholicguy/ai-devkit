
import { Command } from 'commander';
import { registerDocsCommand } from '../../commands/docs.js';
import { ui } from '../../util/terminal-ui.js';

const mockGetDocsDir = vi.fn<() => Promise<string>>();
const mockGetPhases = vi.fn<() => Promise<string[]>>();
const mockCopyFeatureDocTemplates = vi.fn<(...args: unknown[]) => Promise<any>>();
const mockTemplateManagerConstructor = vi.fn();

vi.mock('../../lib/Config.js', () => ({
  ConfigManager: vi.fn(() => ({
    getDocsDir: mockGetDocsDir,
    getPhases: mockGetPhases
  }))
}));

vi.mock('../../lib/TemplateManager.js', () => ({
  TemplateManager: vi.fn((...args: unknown[]) => {
    mockTemplateManagerConstructor(...args);
    return {
      copyFeatureDocTemplates: (...copyArgs: unknown[]) => mockCopyFeatureDocTemplates(...copyArgs)
    };
  })
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    error: vi.fn(),
    success: vi.fn(),
    text: vi.fn()
  }
}));

describe('docs command', () => {
  const mockedUi = vi.mocked(ui);

  beforeEach(() => {
    vi.clearAllMocks();
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
    vi.useRealTimers();
    process.exitCode = undefined;
  });

  it('registers docs init-feature and creates docs using config docsDir', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10, 30));
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10, 30));
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'sample']);

    expect(mockCopyFeatureDocTemplates).toHaveBeenCalledWith('sample', {
      date: '2026-05-25',
      phases: ['requirements', 'design']
    });
  });

  it('prints JSON output when requested', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10, 30));
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 25, 10, 30));
    mockCopyFeatureDocTemplates.mockRejectedValue(new Error('Feature docs already exist'));
    const program = new Command();
    registerDocsCommand(program);

    await program.parseAsync(['node', 'test', 'docs', 'init-feature', 'sample']);

    expect(process.exitCode).toBe(1);
    expect(mockedUi.error).toHaveBeenCalledWith('Feature docs already exist');
  });
});
