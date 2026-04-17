import { McpServerDefinition, EnvironmentCode } from '../../../../types';

const mockPrompt = jest.fn();
jest.mock('inquirer', () => ({ prompt: (...args: unknown[]) => mockPrompt(...args) }));

const mockHasMcpSupport = jest.fn();
jest.mock('../../../../util/env', () => ({
  hasMcpSupport: (...args: unknown[]) => mockHasMcpSupport(...args),
}));

const mockIsInteractiveTerminal = jest.fn();
jest.mock('../../../../util/terminal', () => ({
  isInteractiveTerminal: () => mockIsInteractiveTerminal(),
}));

const mockPlan = jest.fn();
const mockApply = jest.fn();
jest.mock('../../../../services/install/mcp/ClaudeCodeMcpGenerator', () => ({
  ClaudeCodeMcpGenerator: jest.fn().mockImplementation(() => ({
    agentType: 'claude' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  })),
}));
jest.mock('../../../../services/install/mcp/CodexMcpGenerator', () => ({
  CodexMcpGenerator: jest.fn().mockImplementation(() => ({
    agentType: 'codex' as EnvironmentCode,
    plan: (...args: unknown[]) => mockPlan(...args),
    apply: (...args: unknown[]) => mockApply(...args),
  })),
}));

import { installMcpServers } from '../../../../services/install/mcp/McpConfigGenerator';

const servers: Record<string, McpServerDefinition> = {
  memory: { transport: 'stdio', command: 'npx', args: ['-y', '@ai-devkit/memory'] },
};

describe('McpConfigGenerator (orchestrator)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
    mockPrompt.mockResolvedValue({ action: 'overwrite' });

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(mockPrompt).toHaveBeenCalled();
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
    mockPrompt.mockResolvedValue({ action: 'skip' });

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
    expect(mockPrompt).not.toHaveBeenCalled();
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
    expect(mockPrompt).not.toHaveBeenCalled();
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
    expect(mockPrompt).not.toHaveBeenCalled();
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
    // First prompt: choose per server, second prompt: confirm overwrite
    mockPrompt
      .mockResolvedValueOnce({ action: 'choose' })
      .mockResolvedValueOnce({ overwrite: true });

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(mockPrompt).toHaveBeenCalledTimes(2);
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
    mockPrompt
      .mockResolvedValueOnce({ action: 'choose' })
      .mockResolvedValueOnce({ overwrite: false });

    const report = await installMcpServers(servers, ['claude'], '/project');
    expect(report.conflicts).toBe(1);
    expect(report.installed).toBe(0);
  });
});
