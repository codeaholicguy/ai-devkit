import { Command } from 'commander';

const {
  mockPluginManager,
  mockUi,
} = vi.hoisted(() => ({
  mockPluginManager: {
    add: vi.fn(),
    remove: vi.fn(),
    list: vi.fn(),
  },
  mockUi: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    text: vi.fn(),
    table: vi.fn(),
  },
}));

vi.mock('../../services/plugin/plugin-manager.service.js', () => ({
  createPluginManager: () => mockPluginManager,
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: mockUi,
}));

import { registerPluginCommand } from '../../commands/plugin.js';

describe('plugin command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPluginManager.add.mockResolvedValue(undefined);
    mockPluginManager.remove.mockResolvedValue(undefined);
    mockPluginManager.list.mockResolvedValue([]);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
  });

  it('registers plugin add and delegates to the plugin manager', async () => {
    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(['node', 'test', 'plugin', 'add', '@ai-devkit/memory-dashboard']);

    expect(mockPluginManager.add).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
    expect(mockUi.success).toHaveBeenCalledWith('Plugin added: @ai-devkit/memory-dashboard');
  });

  it('registers plugin remove and delegates to the plugin manager', async () => {
    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(['node', 'test', 'plugin', 'remove', '@ai-devkit/memory-dashboard']);

    expect(mockPluginManager.remove).toHaveBeenCalledWith('@ai-devkit/memory-dashboard');
    expect(mockUi.success).toHaveBeenCalledWith('Plugin removed: @ai-devkit/memory-dashboard');
  });

  it('renders plugin list results as a table', async () => {
    mockPluginManager.list.mockResolvedValue([
      {
        name: '@ai-devkit/memory-dashboard',
        status: 'valid',
        error: undefined,
      },
      {
        name: '@ai-devkit/bad-plugin',
        status: 'invalid',
        error: 'missing manifest',
      }
    ]);

    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(['node', 'test', 'plugin', 'list']);

    expect(mockUi.table).toHaveBeenCalledWith({
      headers: ['package', 'status', 'error'],
      rows: [
        ['@ai-devkit/memory-dashboard', 'valid', ''],
        ['@ai-devkit/bad-plugin', 'invalid', 'missing manifest'],
      ]
    });
  });

  it('warns when no plugins are configured', async () => {
    const program = new Command();
    registerPluginCommand(program);

    await program.parseAsync(['node', 'test', 'plugin', 'list']);

    expect(mockUi.warning).toHaveBeenCalledWith('No global plugins configured.');
    expect(mockUi.table).not.toHaveBeenCalled();
  });
});
