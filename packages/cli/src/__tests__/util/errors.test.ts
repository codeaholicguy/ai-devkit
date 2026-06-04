import { ui } from '../../util/terminal-ui.js';
import { handleCliError, isPromptCancelled, withErrorHandler } from '../../util/errors.js';

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

describe('CLI error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
  });

  it('detects prompt cancellation errors from @inquirer/prompts', () => {
    const error = new Error('User force closed the prompt with 0 null');
    error.name = 'ExitPromptError';

    expect(isPromptCancelled(error)).toBe(true);
  });

  it('handles prompt cancellation without printing a failure stack or message', async () => {
    const error = new Error('User force closed the prompt with 0 null');
    error.name = 'ExitPromptError';

    await handleCliError('connect channel', error);

    expect(ui.warning).toHaveBeenCalledWith('Cancelled.');
    expect(ui.error).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(130);
  });

  it('uses the prompt cancellation path from wrapped command handlers', async () => {
    const error = new Error('User force closed the prompt with 0 null');
    error.name = 'ExitPromptError';
    const action = withErrorHandler('connect channel', async () => {
      throw error;
    });

    await action();

    expect(ui.warning).toHaveBeenCalledWith('Cancelled.');
    expect(ui.error).not.toHaveBeenCalled();
    expect(process.exit).toHaveBeenCalledWith(130);
  });
});
