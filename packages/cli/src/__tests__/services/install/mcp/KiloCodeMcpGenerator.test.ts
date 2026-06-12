import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { KiloCodeMcpGenerator } from '../../../../services/install/mcp/KiloCodeMcpGenerator.js';
import { McpServerDefinition } from '../../../../types.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });

const mockFs = fs as Mocked<typeof fs>;

describe('KiloCodeMcpGenerator', () => {
  let generator: KiloCodeMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new KiloCodeMcpGenerator();
  });

  it('marks all servers as new when no existing .kilo/kilo.jsonc exists', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
      notion: { transport: 'http', url: 'https://mcp.notion.com/mcp' },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.newServers).toEqual(['memory', 'notion']);
    expect(plan.conflictServers).toEqual([]);
    expect(plan.skippedServers).toEqual([]);
  });

  it('skips servers that already exist with identical Kilo config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcp: {
        memory: {
          type: 'local',
          command: ['npx', '-y', '@ai-devkit/memory'],
          enabled: true,
          timeout: 10000,
        },
      },
    }) as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.skippedServers).toEqual(['memory']);
    expect(plan.newServers).toEqual([]);
    expect(plan.conflictServers).toEqual([]);
  });

  it('detects conflicts when server exists with different config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcp: {
        memory: {
          type: 'local',
          command: ['node', 'old-server.js'],
          enabled: true,
          timeout: 10000,
        },
      },
    }) as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.conflictServers).toEqual(['memory']);
    expect(plan.newServers).toEqual([]);
  });

  it('writes MCP servers to .kilo/kilo.jsonc and preserves unmanaged config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(`{
      // Kilo settings outside MCP should remain intact.
      "otherConfig": true,
      "mcp": {
        "custom": {
          "type": "local",
          "command": ["my-custom-server"],
          "enabled": true,
          "timeout": 10000,
        },
      },
    }` as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer token' } },
    };

    await generator.apply(
      { agentType: 'kilocode', newServers: ['memory', 'browser'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(projectRoot, '.kilo'));
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      path.join(projectRoot, '.kilo', 'kilo.jsonc'),
      expect.any(String)
    );
    expect(JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string)).toEqual({
      otherConfig: true,
      mcp: {
        custom: {
          type: 'local',
          command: ['my-custom-server'],
          enabled: true,
          timeout: 10000,
        },
        memory: {
          type: 'local',
          command: ['npx', '-y', '@ai-devkit/memory'],
          environment: { DB: './db' },
          enabled: true,
          timeout: 10000,
        },
        browser: {
          type: 'remote',
          url: 'https://mcp.example.com/mcp',
          enabled: true,
          timeout: 15000,
          headers: { Authorization: 'Bearer token' },
        },
      },
    });
  });

  it('maps sse transport to remote Kilo server config', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      legacy: { transport: 'sse', url: 'https://api.example.com/sse' },
    };

    await generator.apply(
      { agentType: 'kilocode', newServers: ['legacy'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    const written = JSON.parse((mockFs.writeFile.mock.calls[0]![1] as string));
    expect(written.mcp.legacy).toEqual({
      type: 'remote',
      url: 'https://api.example.com/sse',
      enabled: true,
      timeout: 15000,
    });
  });
});
