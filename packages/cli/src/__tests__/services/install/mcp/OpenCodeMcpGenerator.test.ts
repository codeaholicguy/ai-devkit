import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { OpenCodeMcpGenerator } from '../../../../services/install/mcp/OpenCodeMcpGenerator.js';
import { McpServerDefinition } from '../../../../types.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });

const mockFs = fs as Mocked<typeof fs>;

describe('OpenCodeMcpGenerator', () => {
  let generator: OpenCodeMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new OpenCodeMcpGenerator();
  });

  it('marks all servers as new when no existing opencode.json exists', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
      docs: { transport: 'http', url: 'https://mcp.example.com/mcp' },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.newServers).toEqual(['memory', 'docs']);
    expect(plan.conflictServers).toEqual([]);
    expect(plan.skippedServers).toEqual([]);
  });

  it('skips servers that already exist with identical OpenCode config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      mcp: {
        memory: {
          type: 'local',
          command: ['npx', '-y', '@ai-devkit/memory'],
          enabled: true,
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

  it('writes MCP servers to opencode.json and preserves unmanaged config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(JSON.stringify({
      $schema: 'https://opencode.ai/config.json',
      theme: 'system',
      tools: {
        'custom_*': false,
      },
      mcp: {
        custom: {
          type: 'local',
          command: ['my-custom-server'],
          enabled: true,
        },
      },
    }) as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer token' } },
    };

    await generator.apply(
      { agentType: 'opencode', newServers: ['memory', 'browser'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    expect(mockFs.ensureDir).toHaveBeenCalledWith(projectRoot);
    expect(mockFs.writeFile).toHaveBeenCalledWith(
      path.join(projectRoot, 'opencode.json'),
      expect.any(String)
    );
    expect(JSON.parse(mockFs.writeFile.mock.calls[0]![1] as string)).toEqual({
      $schema: 'https://opencode.ai/config.json',
      theme: 'system',
      tools: {
        'custom_*': false,
      },
      mcp: {
        custom: {
          type: 'local',
          command: ['my-custom-server'],
          enabled: true,
        },
        memory: {
          type: 'local',
          command: ['npx', '-y', '@ai-devkit/memory'],
          environment: { DB: './db' },
          enabled: true,
        },
        browser: {
          type: 'remote',
          url: 'https://mcp.example.com/mcp',
          enabled: true,
          headers: { Authorization: 'Bearer token' },
        },
      },
    });
  });

  it('maps sse transport to remote OpenCode server config', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      legacy: { transport: 'sse', url: 'https://api.example.com/sse' },
    };

    await generator.apply(
      { agentType: 'opencode', newServers: ['legacy'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    const written = JSON.parse((mockFs.writeFile.mock.calls[0]![1] as string));
    expect(written.mcp.legacy).toEqual({
      type: 'remote',
      url: 'https://api.example.com/sse',
      enabled: true,
    });
  });
});
