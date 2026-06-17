import { Command } from 'commander';
import { createMemoryDashboardAction, register } from '../src/command';

describe('memory dashboard command', () => {
  it('uses runtime memory path and parsed server options', async () => {
    const startServer = vi.fn().mockResolvedValue({
      url: 'http://127.0.0.2:4567',
      close: vi.fn(),
    });
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };

    const action = createMemoryDashboardAction(runtime, { startServer });

    await action({
      host: '127.0.0.2',
      port: '4567',
      open: false,
    });

    expect(runtime.getMemoryDbPath).toHaveBeenCalledOnce();
    expect(startServer).toHaveBeenCalledWith({
      dbPath: '/tmp/memory.db',
      host: '127.0.0.2',
      port: 4567,
    });
    expect(runtime.logger.info).toHaveBeenCalledWith('Memory dashboard: http://127.0.0.2:4567');
  });

  it('opens the dashboard URL when browser open is requested', async () => {
    const openUrl = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };

    const action = createMemoryDashboardAction(runtime, {
      startServer: vi.fn().mockResolvedValue({
        url: 'http://127.0.0.1:3000',
        close: vi.fn(),
      }),
      openUrl,
    });

    await action({ open: true });

    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:3000');
    expect(runtime.logger.warn).not.toHaveBeenCalled();
  });

  it('warns when browser open fails', async () => {
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };

    const action = createMemoryDashboardAction(runtime, {
      startServer: vi.fn().mockResolvedValue({
        url: 'http://127.0.0.1:3000',
        close: vi.fn(),
      }),
      openUrl: vi.fn().mockRejectedValue(new Error('missing opener')),
    });

    await action({ open: true });

    expect(runtime.logger.warn).toHaveBeenCalledWith(
      'Unable to open browser automatically: missing opener. Open the printed URL manually.'
    );
  });

  it('rejects invalid ports before starting the server', async () => {
    const startServer = vi.fn();
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };

    const action = createMemoryDashboardAction(runtime, { startServer });

    await expect(action({ port: '65536' })).rejects.toThrow('Port must be an integer between 0 and 65535.');
    expect(startServer).not.toHaveBeenCalled();
  });

  it('supports runtimes without a warn logger', async () => {
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
      },
    };

    const action = createMemoryDashboardAction(runtime, {
      startServer: vi.fn().mockResolvedValue({
        url: 'http://127.0.0.1:3000',
        close: vi.fn(),
      }),
      openUrl: vi.fn().mockRejectedValue(new Error('missing opener')),
    });

    await expect(action({ open: true })).resolves.toBeUndefined();
  });


  it('registers host, port, and open options on the command', async () => {
    const command = new Command('memory-dashboard');
    const openUrl = vi.fn().mockResolvedValue(undefined);
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };

    register(command, runtime, {
      startServer: vi.fn().mockResolvedValue({
        url: 'http://127.0.0.1:3000',
        close: vi.fn(),
      }),
      openUrl,
    });

    await command.parseAsync(['node', 'memory-dashboard', '--host', '127.0.0.1', '--port', '3000', '--open'], {
      from: 'user',
    });

    expect(runtime.getMemoryDbPath).toHaveBeenCalledOnce();
    expect(openUrl).toHaveBeenCalledWith('http://127.0.0.1:3000');
  });

  it('includes dashboard options in help output', () => {
    const command = new Command('memory-dashboard');
    const runtime = {
      getMemoryDbPath: vi.fn().mockResolvedValue('/tmp/memory.db'),
      logger: {
        info: vi.fn(),
        warn: vi.fn(),
      },
    };

    register(command, runtime, {
      startServer: vi.fn(),
    });

    const help = command.helpInformation();

    expect(help).toContain('--host <host>');
    expect(help).toContain('--port <port>');
    expect(help).toContain('--open');
  });
});
