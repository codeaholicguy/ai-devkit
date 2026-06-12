import type { Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { GitHubCopilotMcpGenerator } from '../../../../services/install/mcp/GitHubCopilotMcpGenerator.js';
import { McpServerDefinition } from '../../../../types.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../../../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });

const mockFs = fs as Mocked<typeof fs>;

describe('GitHubCopilotMcpGenerator', () => {
  let generator: GitHubCopilotMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    vi.clearAllMocks();
    generator = new GitHubCopilotMcpGenerator();
  });

  it('marks all servers as new when no existing .mcp.json exists', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp' },
    };

    const plan = await generator.plan(servers, projectRoot);

    expect(plan.agentType).toBe('github');
    expect(plan.newServers).toEqual(['memory', 'browser']);
    expect(plan.conflictServers).toEqual([]);
    expect(plan.skippedServers).toEqual([]);
  });

  it('writes MCP servers to .mcp.json and preserves unmanaged config', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readJson.mockResolvedValue({
      mcpServers: {
        custom: { command: 'custom-server' },
      },
      enabled: true,
    } as never);

    const servers: Record<string, McpServerDefinition> = {
      memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './memory.db' } },
      browser: { transport: 'http', url: 'https://mcp.example.com/mcp', headers: { Authorization: 'Bearer token' } },
    };

    await generator.apply(
      { agentType: 'github', newServers: ['memory', 'browser'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
      servers,
      projectRoot
    );

    expect(mockFs.writeJson).toHaveBeenCalledWith(
      path.join(projectRoot, '.mcp.json'),
      {
        enabled: true,
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
});
