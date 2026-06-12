import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { DevinMcpGenerator } from '../../../../services/install/mcp/DevinMcpGenerator.js';
import { McpServerDefinition } from '../../../../types.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });

const mockFs = fs as Mocked<typeof fs>;

describe('DevinMcpGenerator', () => {
  let generator: DevinMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new DevinMcpGenerator();
  });

  it('marks all servers as new when no existing .devin/config.json exists', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp' },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.agentType).toBe('devin');
    expect(plan.newServers).toEqual(['memory', 'browser']);
    expect(plan.conflictServers).toEqual([]);
    expect(plan.skippedServers).toEqual([]);
  });

  it('patches only mcpServers in .devin/config.json and preserves other config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readJson.mockResolvedValue({
      mcpServers: {
        custom: { command: 'custom-server' },
      },
      workspace: {
        autoOpen: true,
      },
      model: 'default',
    } as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './memory.db' } },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer token' } },
    };

    await generator.apply(
      { agentType: 'devin', newServers: ['memory', 'browser'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(projectRoot, '.devin'));
    expect(mockFs.writeJson).toHaveBeenCalledWith(
      path.join(projectRoot, '.devin', 'config.json'),
      {
        workspace: {
          autoOpen: true,
        },
        model: 'default',
        mcpServers: {
          custom: { command: 'custom-server' },
          memory: { command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './memory.db' } },
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

  it('detects identical existing server config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readJson.mockResolvedValue({
      mcpServers: {
        legacy: { type: 'sse', url: 'https://api.example.com/sse' },
      },
      model: 'default',
    } as never);

    const servers: Record<string, McpServerDefinition> = {
      legacy: { transport: 'sse', url: 'https://api.example.com/sse' },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.skippedServers).toEqual(['legacy']);
    expect(plan.newServers).toEqual([]);
    expect(plan.conflictServers).toEqual([]);
  });
});
