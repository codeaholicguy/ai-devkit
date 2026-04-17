import * as fs from 'fs-extra';
import { loadInitTemplate } from '../../lib/InitTemplate';

jest.mock('fs-extra');

describe('InitTemplate mcpServers validation', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts valid mcpServers with stdio transport', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        memory: {
          transport: 'stdio',
          command: 'npx',
          args: ['-y', '@ai-devkit/memory'],
          env: { DB: './db' }
        }
      }
    }) as never);

    const result = await loadInitTemplate('/tmp/init.json');

    expect(result.mcpServers).toEqual({
      memory: {
        transport: 'stdio',
        command: 'npx',
        args: ['-y', '@ai-devkit/memory'],
        env: { DB: './db' }
      }
    });
  });

  it('accepts valid mcpServers with http transport', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        notion: {
          transport: 'http',
          url: 'https://mcp.notion.com/mcp',
          headers: { Authorization: 'Bearer token' }
        }
      }
    }) as never);

    const result = await loadInitTemplate('/tmp/init.json');

    expect(result.mcpServers).toEqual({
      notion: {
        transport: 'http',
        url: 'https://mcp.notion.com/mcp',
        headers: { Authorization: 'Bearer token' }
      }
    });
  });

  it('accepts valid mcpServers with sse transport', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        legacy: {
          transport: 'sse',
          url: 'https://api.example.com/sse'
        }
      }
    }) as never);

    const result = await loadInitTemplate('/tmp/init.json');
    expect(result.mcpServers!.legacy.transport).toBe('sse');
  });

  it('accepts mixed stdio and http servers', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        local: { transport: 'stdio', command: 'node', args: ['server.js'] },
        remote: { transport: 'http', url: 'https://example.com/mcp' }
      }
    }) as never);

    const result = await loadInitTemplate('/tmp/init.json');
    expect(Object.keys(result.mcpServers!)).toEqual(['local', 'remote']);
  });

  it('accepts stdio server without optional args and env', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        simple: { transport: 'stdio', command: 'my-server' }
      }
    }) as never);

    const result = await loadInitTemplate('/tmp/init.json');
    expect(result.mcpServers!.simple).toEqual({
      transport: 'stdio',
      command: 'my-server'
    });
  });

  it('accepts http server without optional headers', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        api: { transport: 'http', url: 'https://example.com/mcp' }
      }
    }) as never);

    const result = await loadInitTemplate('/tmp/init.json');
    expect(result.mcpServers!.api).toEqual({
      transport: 'http',
      url: 'https://example.com/mcp'
    });
  });

  it('rejects mcpServers with missing transport', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { command: 'npx' }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.transport" must be one of: stdio, http, sse'
    );
  });

  it('rejects mcpServers with invalid transport', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'websocket', url: 'ws://localhost' }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.transport" must be one of: stdio, http, sse'
    );
  });

  it('rejects stdio server without command', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'stdio' }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.command" is required for stdio transport'
    );
  });

  it('rejects http server without url', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'http' }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.url" is required for http transport'
    );
  });

  it('rejects sse server without url', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'sse' }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.url" is required for sse transport'
    );
  });

  it('rejects non-object mcpServers value', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: 'invalid'
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers" must be an object'
    );
  });

  it('rejects non-string args', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'stdio', command: 'npx', args: [123] }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.args" must be an array of strings'
    );
  });

  it('rejects non-string env values', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'stdio', command: 'npx', env: { KEY: 123 } }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.env.KEY" must be a string'
    );
  });

  it('rejects non-string header values', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcpServers: {
        bad: { transport: 'http', url: 'https://x.com', headers: { Auth: 123 } }
      }
    }) as never);

    await expect(loadInitTemplate('/tmp/init.json')).rejects.toThrow(
      '"mcpServers.bad.headers.Auth" must be a string'
    );
  });

  it('loads mcpServers from YAML template', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(`
mcpServers:
  memory:
    transport: stdio
    command: npx
    args: ["-y", "@ai-devkit/memory"]
    env:
      DB: "./db"
  notion:
    transport: http
    url: https://mcp.notion.com/mcp
` as never);

    const result = await loadInitTemplate('/tmp/init.yaml');

    expect(Object.keys(result.mcpServers!)).toEqual(['memory', 'notion']);
    expect(result.mcpServers!.memory.transport).toBe('stdio');
    expect(result.mcpServers!.notion.transport).toBe('http');
  });
});
