import { join } from 'path';
import { tmpdir } from 'os';
import { mkdirSync, rmSync, writeFileSync } from 'fs';
import { createStandaloneMemoryRuntime, parseStandaloneOptions } from '../src/standalone';

describe('standalone memory dashboard launcher', () => {
  const homeDir = join(tmpdir(), `memory-dashboard-home-${Date.now()}-${Math.random().toString(36)}`);

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
  });

  it('resolves the same default memory database path as the plugin runtime', async () => {
    const runtime = createStandaloneMemoryRuntime({ homeDir });

    await expect(runtime.getMemoryDbPath()).resolves.toBe(join(homeDir, '.ai-devkit', 'memory.db'));
  });

  it('resolves configured relative memory paths from the AI DevKit config directory', async () => {
    mkdirSync(join(homeDir, '.ai-devkit'), { recursive: true });
    writeFileSync(join(homeDir, '.ai-devkit', '.ai-devkit.json'), JSON.stringify({
      memory: {
        path: 'custom-memory.db',
      },
    }));

    const runtime = createStandaloneMemoryRuntime({ homeDir });

    await expect(runtime.getMemoryDbPath()).resolves.toBe(join(homeDir, '.ai-devkit', 'custom-memory.db'));
  });

  it('resolves configured absolute memory paths unchanged', async () => {
    mkdirSync(join(homeDir, '.ai-devkit'), { recursive: true });
    writeFileSync(join(homeDir, '.ai-devkit', '.ai-devkit.json'), JSON.stringify({
      memory: {
        path: '/tmp/absolute-memory.db',
      },
    }));

    const runtime = createStandaloneMemoryRuntime({ homeDir });

    await expect(runtime.getMemoryDbPath()).resolves.toBe('/tmp/absolute-memory.db');
  });

  it('ignores blank configured memory paths', async () => {
    mkdirSync(join(homeDir, '.ai-devkit'), { recursive: true });
    writeFileSync(join(homeDir, '.ai-devkit', '.ai-devkit.json'), JSON.stringify({
      memory: {
        path: '   ',
      },
    }));

    const runtime = createStandaloneMemoryRuntime({ homeDir });

    await expect(runtime.getMemoryDbPath()).resolves.toBe(join(homeDir, '.ai-devkit', 'memory.db'));
  });

  it('surfaces invalid AI DevKit config JSON', async () => {
    mkdirSync(join(homeDir, '.ai-devkit'), { recursive: true });
    writeFileSync(join(homeDir, '.ai-devkit', '.ai-devkit.json'), '{');

    const runtime = createStandaloneMemoryRuntime({ homeDir });

    await expect(runtime.getMemoryDbPath()).rejects.toThrow();
  });

  it('lets standalone launches override the memory database path', async () => {
    const runtime = createStandaloneMemoryRuntime({
      homeDir,
      dbPathOverride: '/tmp/standalone-memory.db',
    });

    await expect(runtime.getMemoryDbPath()).resolves.toBe('/tmp/standalone-memory.db');
  });

  it('parses standalone dashboard options', () => {
    expect(parseStandaloneOptions([
      '--host',
      '127.0.0.2',
      '--port',
      '4567',
      '--db-path',
      '/tmp/memory.db',
      '--open',
    ])).toEqual({
      host: '127.0.0.2',
      port: '4567',
      dbPath: '/tmp/memory.db',
      open: true,
    });
  });
});
