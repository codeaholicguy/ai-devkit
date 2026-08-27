import fs from 'fs-extra';
import os from 'os';
import path from 'path';
import { reconcileAndInstall } from '../../../services/install/install.service.js';

describe('project application integration', () => {
  let projectRoot: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-devkit-install-'));
    process.chdir(projectRoot);
    await fs.writeJson(path.join(projectRoot, '.ai-devkit.json'), {
      version: 'test',
      environments: ['claude', 'github', 'codex', 'junie', 'devin', 'roo', 'kilocode', 'opencode'],
      phases: ['requirements'],
      createdAt: new Date(0).toISOString(),
      mcpServers: {
        memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] }
      }
    });
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.remove(projectRoot);
  });

  it('creates project docs and MCP config, then matches without rewriting them', async () => {
    const desired = {
      environments: [
        'claude' as const, 'github' as const, 'codex' as const, 'junie' as const,
        'devin' as const, 'roo' as const, 'kilocode' as const, 'opencode' as const
      ],
      phases: ['requirements' as const],
      registries: {},
      skills: [],
      mcpServers: {
        memory: { transport: 'stdio' as const, command: 'npx', args: ['-y', '@ai-devkit/memory'] }
      }
    };

    const first = await reconcileAndInstall(desired, { nonInteractive: true });
    const phasePath = path.join(projectRoot, 'docs/ai/requirements/README.md');
    const mcpPath = path.join(projectRoot, '.codex/config.toml');
    const firstPhase = await fs.readFile(phasePath, 'utf8');
    const firstMcp = await fs.readFile(mcpPath, 'utf8');
    const mcpTargets = [
      '.mcp.json', '.codex/config.toml', '.junie/mcp/mcp.json', '.devin/config.json',
      '.roo/mcp.json', '.kilo/kilo.jsonc', 'opencode.json'
    ];

    const second = await reconcileAndInstall(desired, { nonInteractive: true });

    expect(first.complete).toBe(true);
    for (const target of mcpTargets) {
      expect(await fs.pathExists(path.join(projectRoot, target))).toBe(true);
    }
    expect(first.mcpServers.installed).toBe(mcpTargets.length);
    expect(first.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'phase', status: 'installed' }),
      expect.objectContaining({ section: 'mcpServer', status: 'installed' })
    ]));
    expect(second.complete).toBe(true);
    expect(second.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ section: 'phase', status: 'skipped' }),
      expect.objectContaining({ section: 'mcpServer', status: 'matched' })
    ]));
    expect(await fs.readFile(phasePath, 'utf8')).toBe(firstPhase);
    expect(await fs.readFile(mcpPath, 'utf8')).toBe(firstMcp);
  });

  it('fails malformed MCP targets without replacing them', async () => {
    const mcpPath = path.join(projectRoot, '.codex/config.toml');
    await fs.ensureDir(path.dirname(mcpPath));
    await fs.writeFile(mcpPath, 'invalid [[[');

    const report = await reconcileAndInstall({
      environments: ['codex'],
      phases: [],
      registries: {},
      skills: [],
      mcpServers: { memory: { transport: 'stdio', command: 'npx' } }
    }, { nonInteractive: true });

    expect(report.complete).toBe(false);
    expect(report.items).toContainEqual(expect.objectContaining({
      section: 'mcpServer', status: 'failed'
    }));
    expect(await fs.readFile(mcpPath, 'utf8')).toBe('invalid [[[');
  });

  it('fails non-interactive MCP conflicts and resolves them with overwrite', async () => {
    const mcpPath = path.join(projectRoot, '.codex/config.toml');
    await fs.ensureDir(path.dirname(mcpPath));
    await fs.writeFile(mcpPath, '[mcp_servers.memory]\ncommand = "old"\n');
    const desired = {
      environments: ['codex' as const],
      phases: [],
      registries: {},
      skills: [],
      mcpServers: { memory: { transport: 'stdio' as const, command: 'new' } }
    };

    const conflict = await reconcileAndInstall(desired, { nonInteractive: true });
    expect(conflict.complete).toBe(false);
    expect(conflict.items).toContainEqual(expect.objectContaining({ status: 'conflict' }));
    expect(await fs.readFile(mcpPath, 'utf8')).toContain('command = "old"');

    const resolved = await reconcileAndInstall(desired, {
      nonInteractive: true,
      overwrite: true
    });
    expect(resolved.complete).toBe(true);
    expect(await fs.readFile(mcpPath, 'utf8')).toContain('command = "new"');
  });
});
