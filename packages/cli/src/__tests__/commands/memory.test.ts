import { Command } from 'commander';
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { registerMemoryCommand } from '../../commands/memory';
import { memorySearchCommand, memoryStoreCommand } from '@ai-devkit/memory';
import { ui } from '../../util/terminal-ui';

jest.mock('@ai-devkit/memory', () => ({
  memoryStoreCommand: jest.fn(),
  memorySearchCommand: jest.fn()
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: {
    error: jest.fn(),
    warning: jest.fn(),
    table: jest.fn()
  }
}));

describe('memory command', () => {
  const mockedMemorySearchCommand = memorySearchCommand as jest.MockedFunction<typeof memorySearchCommand>;
  const mockedMemoryStoreCommand = memoryStoreCommand as jest.MockedFunction<typeof memoryStoreCommand>;
  const mockedUi = jest.mocked(ui);
  let consoleLogSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  it('prints JSON for memory store', async () => {
    const result = {
      success: true,
      id: 'mem-1',
      message: 'stored'
    };
    mockedMemoryStoreCommand.mockReturnValue(result);

    const program = new Command();
    registerMemoryCommand(program);
    await program.parseAsync([
      'node',
      'test',
      'memory',
      'store',
      '--title',
      'A valid title 123',
      '--content',
      'This is a valid content body long enough to satisfy constraints.'
    ]);

    expect(mockedMemoryStoreCommand).toHaveBeenCalled();
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
  });

  it('handles store errors by showing error and exiting', async () => {
    mockedMemoryStoreCommand.mockImplementation(() => {
      throw new Error('store failed');
    });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    const program = new Command();
    registerMemoryCommand(program);

    await expect(
      program.parseAsync([
        'node',
        'test',
        'memory',
        'store',
        '--title',
        'A valid title 123',
        '--content',
        'This is a valid content body long enough to satisfy constraints.'
      ])
    ).rejects.toThrow('process.exit');

    expect(mockedUi.error).toHaveBeenCalledWith('store failed');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it('prints JSON by default for memory search', async () => {
    const result = {
      results: [
        {
          id: 'mem-1',
          title: 'Use DTOs for API responses',
          content: 'Always use DTOs',
          tags: ['api'],
          scope: 'global',
          score: 1
        }
      ],
      totalMatches: 1,
      query: 'dto'
    };
    mockedMemorySearchCommand.mockReturnValue(result);

    const program = new Command();
    registerMemoryCommand(program);
    await program.parseAsync(['node', 'test', 'memory', 'search', '--query', 'dto']);

    expect(mockedMemorySearchCommand).toHaveBeenCalledWith({
      query: 'dto',
      tags: undefined,
      scope: undefined,
      limit: 5
    });
    expect(consoleLogSpy).toHaveBeenCalledWith(JSON.stringify(result, null, 2));
    expect(mockedUi.table).not.toHaveBeenCalled();
  });

  it('renders table output with id, title, and scope when --table is used', async () => {
    mockedMemorySearchCommand.mockReturnValue({
      results: [
        {
          id: 'mem-1',
          title: 'A very long memory title that should be truncated for narrow terminals when displayed',
          content: 'x',
          tags: ['cli'],
          scope: 'project:ai-devkit',
          score: 1
        }
      ],
      totalMatches: 1,
      query: 'memory'
    });

    const program = new Command();
    registerMemoryCommand(program);
    await program.parseAsync(['node', 'test', 'memory', 'search', '--query', 'memory', '--table', '--limit', '3']);

    expect(mockedMemorySearchCommand).toHaveBeenCalledWith({
      query: 'memory',
      tags: undefined,
      scope: undefined,
      limit: 3
    });
    expect(mockedUi.table).toHaveBeenCalledWith({
      headers: ['id', 'title', 'scope'],
      rows: [['mem-1', 'A very long memory title that should be truncated for nar...', 'project:ai-devkit']]
    });
    expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('"results"'));
  });

  it('shows a warning when --table has no matching results', async () => {
    mockedMemorySearchCommand.mockReturnValue({
      results: [],
      totalMatches: 0,
      query: 'missing'
    });

    const program = new Command();
    registerMemoryCommand(program);
    await program.parseAsync(['node', 'test', 'memory', 'search', '--query', 'missing', '--table']);

    expect(mockedUi.warning).toHaveBeenCalledWith('No memory items found matching "missing"');
    expect(mockedUi.table).not.toHaveBeenCalled();
  });

  it('handles search errors by showing error and exiting', async () => {
    mockedMemorySearchCommand.mockImplementation(() => {
      throw new Error('search failed');
    });
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('process.exit');
    }) as never);

    const program = new Command();
    registerMemoryCommand(program);

    await expect(
      program.parseAsync(['node', 'test', 'memory', 'search', '--query', 'memory'])
    ).rejects.toThrow('process.exit');

    expect(mockedUi.error).toHaveBeenCalledWith('search failed');
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});
