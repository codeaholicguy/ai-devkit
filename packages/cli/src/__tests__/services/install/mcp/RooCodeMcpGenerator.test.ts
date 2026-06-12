import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { RooCodeMcpGenerator } from '../../../../services/install/mcp/RooCodeMcpGenerator.js';
import { McpServerDefinition } from '../../../../types.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });

const mockFs = fs as Mocked<typeof fs>;

describe('RooCodeMcpGenerator', () => {
  let generator: RooCodeMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new RooCodeMcpGenerator();
  });

  it('marks all servers as new when no existing .roo/mcp.json exists', async () => {
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

  it('skips servers that already exist with identical config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readJson.mockResolvedValue({
      mcpServers: {
        memory: { command: 'npx', args: ['-y', '@ai-devkit/memory'] },
      },
    } as never);

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
    mockFs.readJson.mockResolvedValue({
      mcpServers: {
        memory: { command: 'node', args: ['old-server.js'] },
      },
    } as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.conflictServers).toEqual(['memory']);
    expect(plan.newServers).toEqual([]);
  });

  it('writes MCP servers to .roo/mcp.json and preserves unmanaged config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readJson.mockResolvedValue({
      otherConfig: true,
      mcpServers: {
        custom: { command: 'my-custom-server' },
      },
    } as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer token' } },
    };

    await generator.apply(
      { agentType: 'roo', newServers: ['memory', 'browser'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(projectRoot, '.roo'));
    expect(mockFs.writeJson).toHaveBeenCalledWith(
      path.join(projectRoot, '.roo', 'mcp.json'),
      {
        otherConfig: true,
        mcpServers: {
          custom: { command: 'my-custom-server' },
          memory: { command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } },
          browser: {
            type: 'http',
            url: 'https://mcp.example.com/mcp',
            headers: { Authorization: 'Bearer token' },
          },
        },
      },
      { spaces: 2 }
    );
  });

  it('maps sse transport to type: sse', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      legacy: { transport: 'sse', url: 'https://api.example.com/sse' },
    };

    await generator.apply(
      { agentType: 'roo', newServers: ['legacy'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    const written = mockFs.writeJson.mock.calls[0]![1] as any;
    expect(written.mcpServers.legacy).toEqual({ type: 'sse', url: 'https://api.example.com/sse' });
  });
});
