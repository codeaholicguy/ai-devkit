import * as fs from 'fs-extra';
import * as path from 'path';
import { CodexMcpGenerator } from '../../../../services/install/mcp/CodexMcpGenerator';
import { McpServerDefinition } from '../../../../types';

jest.mock('fs-extra');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('CodexMcpGenerator', () => {
  let generator: CodexMcpGenerator;
  const projectRoot = '/project';

  beforeEach(() => {
    jest.clearAllMocks();
    generator = new CodexMcpGenerator();
  });

  describe('plan()', () => {
    it('marks all servers as new when no existing config.toml', async () => {
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
      mockFs.readFile.mockResolvedValue(`
[mcp_servers.memory]
command = "npx"
args = ["-y", "@ai-devkit/memory"]
` as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] }
      };

      const plan = await generator.plan(servers, projectRoot);

      expect(plan.skippedServers).toEqual(['memory']);
      expect(plan.newServers).toEqual([]);
    });

    it('detects conflicts when server exists with different config', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readFile.mockResolvedValue(`
[mcp_servers.memory]
command = "old-cmd"
` as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'new-cmd' }
      };

      const plan = await generator.plan(servers, projectRoot);

      expect(plan.conflictServers).toEqual(['memory']);
    });

    it('handles malformed existing config.toml gracefully', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readFile.mockResolvedValue('this is not valid toml [[[' as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx' }
      };

      const plan = await generator.plan(servers, projectRoot);
      expect(plan.newServers).toEqual(['memory']);
    });
  });

  describe('apply()', () => {
    it('writes new servers to .codex/config.toml when no existing file', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'], env: { DB: './db' } }
      };

      await generator.apply(
        { agentType: 'codex', newServers: ['memory'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(projectRoot, '.codex'));
      expect(mockFs.writeFile).toHaveBeenCalled();

      const written = mockFs.writeFile.mock.calls[0]![1] as string;
      expect(written).toContain('[mcp_servers.memory]');
      expect(written).toContain('command = "npx"');
      expect(written).toContain('[mcp_servers.memory.env]');
      expect(written).toContain('DB = "./db"');
    });

    it('preserves non-MCP sections in existing config.toml', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readFile.mockResolvedValue(`
model = "gpt-4"
approval_mode = "suggest"

[mcp_servers.existing]
command = "old-server"
` as never);

      const servers: Record<string, McpServerDefinition> = {
        newserver: { transport: 'stdio', command: 'npx' }
      };

      await generator.apply(
        { agentType: 'codex', newServers: ['newserver'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      const written = mockFs.writeFile.mock.calls[0]![1] as string;
      expect(written).toContain('model = "gpt-4"');
      expect(written).toContain('approval_mode = "suggest"');
      expect(written).toContain('[mcp_servers.existing]');
      expect(written).toContain('[mcp_servers.newserver]');
    });

    it('maps http transport to url with http_headers', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);

      const servers: Record<string, McpServerDefinition> = {
        api: { transport: 'http', url: 'https://api.example.com/mcp', headers: { Authorization: 'Bearer token' } }
      };

      await generator.apply(
        { agentType: 'codex', newServers: ['api'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      const written = mockFs.writeFile.mock.calls[0]![1] as string;
      expect(written).toContain('url = "https://api.example.com/mcp"');
      expect(written).toContain('[mcp_servers.api.http_headers]');
      expect(written).toContain('Authorization = "Bearer token"');
    });

    it('writes resolved conflicts', async () => {
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readFile.mockResolvedValue(`
[mcp_servers.memory]
command = "old-cmd"
` as never);

      const servers: Record<string, McpServerDefinition> = {
        memory: { transport: 'stdio', command: 'new-cmd' }
      };

      await generator.apply(
        { agentType: 'codex', newServers: [], conflictServers: ['memory'], skippedServers: [], resolvedConflicts: ['memory'] },
        servers,
        projectRoot
      );

      const written = mockFs.writeFile.mock.calls[0]![1] as string;
      expect(written).toContain('command = "new-cmd"');
    });

    it('creates .codex directory if missing', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);

      const servers: Record<string, McpServerDefinition> = {
        test: { transport: 'stdio', command: 'test-server' }
      };

      await generator.apply(
        { agentType: 'codex', newServers: ['test'], conflictServers: [], skippedServers: [], resolvedConflicts: [] },
        servers,
        projectRoot
      );

      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join(projectRoot, '.codex'));
    });
  });
});
