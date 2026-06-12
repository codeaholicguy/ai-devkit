import { McpServerDefinition, EnvironmentCode } from '../../../../types.js';

const { mockConfirm, mockSelect } = vi.hoisted(() => ({
  mockConfirm: vi.fn(),
  mockSelect: vi.fn(),
}));
vi.mock('@inquirer/prompts', () => ({
  confirm: (...args: unknown[]) => mockConfirm(...args),
  select: (...args: unknown[]) => mockSelect(...args),
}));

const mockHasMcpSupport = vi.fn();
vi.mock('../../../../util/env.js', () => ({
  hasMcpSupport: (...args: unknown[]) => mockHasMcpSupport(...args),
}));

const mockIsInteractiveTerminal = vi.fn();
vi.mock('../../../../util/terminal.js', () => ({
  isInteractiveTerminal: () => mockIsInteractiveTerminal(),
}));

const mockPlan = vi.fn();
const mockApply = vi.fn();
vi.mock('../../../../services/install/mcp/ClaudeCodeMcpGenerator.js', () => ({
  ClaudeCodeMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'claude' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/CodexMcpGenerator.js', () => ({
  CodexMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'codex' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/JunieMcpGenerator.js', () => ({
  JunieMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'junie' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/GitHubCopilotMcpGenerator.js', () => ({
  GitHubCopilotMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'github' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/DevinMcpGenerator.js', () => ({
  DevinMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'devin' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/RooCodeMcpGenerator.js', () => ({
  RooCodeMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'roo' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/KiloCodeMcpGenerator.js', () => ({
  KiloCodeMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'kilocode' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));
vi.mock('../../../../services/install/mcp/OpenCodeMcpGenerator.js', () => ({
  OpenCodeMcpGenerator: vi.fn().mockImplementation(function () { return {
    agentType: 'opencode' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  }; }),
}));

import { installMcpServers } from '../../../../services/install/mcp/McpConfigGenerator.js';

const servers: Record<string, McpServerDefinition> = {
  memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
};

describe('McpConfigGenerator (orchestrator)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasMcpSupport.mockReturnValue(true);
    mockIsInteractiveTerminal.mockReturnValue(true);
  });

  it('returns empty report when no servers', async () => {
    const report = await installMcpServers({}, ['claude'], '/project');
    expect(report.installed).toBe(0);
    expect(mockPlan).not.toHaveBeenCalled();
  });

  it('skips agents not in environments list', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['claude'], '/project');
    // Only claude generator should run (codex not in environments)
    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('installs MCP servers for Junie when Junie is configured', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'junie',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['junie'], '/project');

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('installs MCP servers for GitHub Copilot when GitHub is configured', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'github',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['github'], '/project');

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('installs MCP servers for Devin when Devin is configured', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'devin',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['devin'], '/project');

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('installs MCP servers for Roo Code when Roo is configured', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'roo',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['roo'], '/project');

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('installs MCP servers for Kilo Code when Kilo is configured', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'kilocode',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['kilocode'], '/project');

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('installs MCP servers for OpenCode when OpenCode is configured', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'opencode',
      newServers: ['memory'],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['opencode'], '/project');

    expect(mockPlan).toHaveBeenCalledTimes(1);
    expect(mockApply).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('skips agents without MCP support', async () => {
    mockHasMcpSupport.mockReturnValue(false);

    const report = await installMcpServers(servers, ['claude', 'codex'], '/project');
    expect(mockPlan).not.toHaveBeenCalled();
    expect(report.installed).toBe(0);
  });

  it('counts skipped servers in report', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: [],
      skippedServers: ['memory'],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(report.skipped).toBe(1);
    expect(report.installed).toBe(0);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('prompts user for conflicts in interactive mode', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });
    mockSelect.mockResolvedValue('overwrite');

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(mockSelect).toHaveBeenCalled();
    expect(report.installed).toBe(1);
    expect(report.conflicts).toBe(0);
  });

  it('skips all conflicts in interactive mode when user chooses skip', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });
    mockSelect.mockResolvedValue('skip');

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(report.conflicts).toBe(1);
    expect(report.installed).toBe(0);
    expect(mockApply).not.toHaveBeenCalled();
  });

  it('skips conflicts in non-interactive mode (CI) by default', async () => {
    mockIsInteractiveTerminal.mockReturnValue(false);
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(report.conflicts).toBe(1);
    expect(report.installed).toBe(0);
  });

  it('overwrites conflicts in non-interactive mode with --overwrite', async () => {
    mockIsInteractiveTerminal.mockReturnValue(false);
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['claude'], '/project', { overwrite: true });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(report.installed).toBe(1);
    expect(report.conflicts).toBe(0);
  });

  it('overwrites conflicts in interactive mode with --overwrite (no prompt)', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });

    const report = await installMcpServers(servers, ['claude'], '/project', { overwrite: true });
    expect(mockSelect).not.toHaveBeenCalled();
    expect(mockConfirm).not.toHaveBeenCalled();
    expect(report.installed).toBe(1);
  });

  it('reports failed when generator throws', async () => {
    mockPlan.mockRejectedValue(new Error('read failure'));

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(report.failed).toBe(1);
    expect(report.installed).toBe(0);
  });

  it('handles per-server choice in interactive mode', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });
    mockSelect.mockResolvedValueOnce('choose');
    mockConfirm.mockResolvedValueOnce(true);

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(mockSelect).toHaveBeenCalledTimes(1);
    expect(mockConfirm).toHaveBeenCalledTimes(1);
    expect(report.installed).toBe(1);
  });

  it('handles per-server choice where user skips', async () => {
    mockPlan.mockResolvedValue({
      agentType: 'claude',
      newServers: [],
      conflictServers: ['memory'],
      skippedServers: [],
      resolvedConflicts: [],
    });
    mockSelect.mockResolvedValueOnce('choose');
    mockConfirm.mockResolvedValueOnce(false);

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(report.conflicts).toBe(1);
    expect(report.installed).toBe(0);
  });
});
