import * as fs from 'fs-extra';
import * as path from 'path';
import { ClaudeCodeMcpGenerator } from '../../../../services/install/mcp/ClaudeCodeMcpGenerator';
import { McpServerDefinition } from '../../../../types';

jest.mock('fs-extra');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('ClaudeCodeMcpGenerator', () => {
  let generator: ClaudeCodeMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    jest.clearAllMocks();
    generator = new ClaudeCodeMcpGenerator();
  });

  describe('plan()', () => {
    it('marks all servers as new when no existing .mcp.json', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
        notion: { transport: 'http', url: 'https://mcp.notion.com/mcp' }
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
          memory: { command: 'npx', args: ['-y', '@ai-devkit/memory'] }
        }
      } as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] }
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
          memory: { command: 'node', args: ['old-server.js'] }
        }
      } as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] }
      };

      const plan = await generator.plan(servers, projectRoot);

      expect(plan.conflictServers).toEqual(['memory']);
      expect(plan.newServers).toEqual([]);
    });

    it('handles http transport with type field comparison', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readJson.mockResolvedValue({
        mcpServers: {
          notion: { type: 'http', url: 'https://mcp.notion.com/mcp' }
        }
      } as never);

      const servers: Record<string, McpServerDefinition> = {
        notion: { transport: 'http', url: 'https://mcp.notion.com/mcp' }
      };

      const plan = await generator.plan(servers, projectRoot);
      expect(plan.skippedServers).toEqual(['notion']);
    });

    it('handles malformed existing .mcp.json gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readJson.mockRejectedValue(new Error('Invalid JSON'));

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx' }
      };

      const plan = await generator.plan(servers, projectRoot);
      expect(plan.newServers).toEqual(['memory']);
    });

    it('handles mixed new, skip, and conflict servers', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readJson.mockResolvedValue({
        mcpServers: {
          existing: { command: 'npx', args: ['-y', 'pkg'] },
          changed: { command: 'old-cmd' }
        }
      } as never);

      const servers: Record<string, McpServerDefinition> = {
        existing: { transport: 'stdio', command: 'npx', args: ['-y', 'pkg'] },
        changed: { transport: 'stdio', command: 'new-cmd' },
        brand_new: { transport: 'http', url: 'https://example.com' }
      };

      const plan = await generator.plan(servers, projectRoot);

      expect(plan.skippedServers).toEqual(['existing']);
      expect(plan.conflictServers).toEqual(['changed']);
      expect(plan.newServers).toEqual(['brand_new']);
    });
  });

  describe('apply()', () => {
    it('writes new servers to .mcp.json when no existing file', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } },
        notion: { transport: 'http', url: 'https://mcp.notion.com/mcp', headers: { Auth: 'Bearer token' } }
      };

      await generator.apply(
        { agentType: 'claude', newServers: ['memory', 'notion'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      expect(mockFs.writeJson).toHaveBeenCalledWith(
        path.join(projectRoot, '.mcp.json'),
        {
          mcpServers: {
            memory: { command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } },
            notion: { type: 'http', url: 'https://mcp.notion.com/mcp', headers: { Auth: 'Bearer token' } }
          }
        },
        { spaces: 2 }
      );
    });

    it('preserves existing unmanaged servers', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readJson.mockResolvedValue({
        mcpServers: {
          custom: { command: 'my-custom-server' }
        }
      } as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx' }
      };

      await generator.apply(
        { agentType: 'claude', newServers: ['memory'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      const written = mockFs.writeJson.mock.calls[0]![1] as any;
      expect(written.mcpServers.custom).toEqual({ command: 'my-custom-server' });
      expect(written.mcpServers.memory).toEqual({ command: 'npx' });
    });

    it('writes resolved conflicts', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readJson.mockResolvedValue({
        mcpServers: {
          memory: { command: 'old-cmd' }
        }
      } as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'new-cmd' }
      };

      await generator.apply(
        { agentType: 'claude', newServers: [], conflictServers: ['memory'], skippedServers: [], resolvedConflicts: ['memory'] },
        servers,
        projectRoot
      );

      const written = mockFs.writeJson.mock.calls[0]![1] as any;
      expect(written.mcpServers.memory).toEqual({ command: 'new-cmd' });
    });

    it('maps sse transport to type: sse', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);

      const servers: Record<string, McpServerDefinition> = {
        legacy: { transport: 'sse', url: 'https://api.example.com/sse' }
      };

      await generator.apply(
        { agentType: 'claude', newServers: ['legacy'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      const written = mockFs.writeJson.mock.calls[0]![1] as any;
      expect(written.mcpServers.legacy).toEqual({ type: 'sse', url: 'https://api.example.com/sse' });
    });
  });
});
