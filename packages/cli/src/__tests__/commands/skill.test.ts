import { Command } from 'commander';

import { registerSkillCommand } from '../../commands/skill.js';
import { ui } from '../../util/terminal-ui.js';

const mockAddSkill = vi.fn();
const mockListGlobalSkills = vi.fn();
const mockListSkills = vi.fn();

vi.mock('../../lib/Config.js', () => ({
  ConfigManager: vi.fn(),
}));

vi.mock('../../lib/SkillManager.js', () => ({
  SkillManager: vi.fn(function () { return {
    addSkill: (...args: unknown[]) => mockAddSkill(...args),
    listGlobalSkills: (...args: unknown[]) => mockListGlobalSkills(...args),
    listSkills: (...args: unknown[]) => mockListSkills(...args),
    removeSkill: vi.fn(),
    updateSkills: vi.fn(),
    findSkills: vi.fn(),
    rebuildIndex: vi.fn(),
  }; }),
}));

vi.mock('../../util/terminal-ui.js', () => ({
  ui: {
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
    text: vi.fn(),
    table: vi.fn(),
  },
}));

describe('skill command', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAddSkill.mockImplementation(async () => undefined);
    mockListGlobalSkills.mockResolvedValue([]);
    mockListSkills.mockResolvedValue([]);
    vi.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    vi.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);
  });

  it('parses skill add with registry only and forwards undefined skill name', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'add', 'anthropics/skills']);

    expect(mockAddSkill).toHaveBeenCalledWith('anthropics/skills', undefined, {
      global: undefined,
      environments: undefined,
    });
    expect(process.stderr.write).not.toHaveBeenCalled();
  });

  it('parses skill add with explicit skill name and forwards both args', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'add', 'anthropics/skills', 'frontend-design']);

    expect(mockAddSkill).toHaveBeenCalledWith('anthropics/skills', 'frontend-design', {
      global: undefined,
      environments: undefined,
    });
  });

  it('shows a warning instead of exiting when skill selection is cancelled', async () => {
    mockAddSkill.mockImplementation(async () => {
      throw new Error('Skill selection cancelled.');
    });

    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'add', 'anthropics/skills']);

    expect(ui.warning).toHaveBeenCalledWith('Skill selection cancelled.');
    expect(ui.error).not.toHaveBeenCalled();
  });

  it('installs all built-in skills with skill add --built-in', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'add', '--built-in']);

    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'agent-communication', {
      global: undefined,
      environments: undefined,
    });
    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'agent-management', {
      global: undefined,
      environments: undefined,
    });
    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'dev-commit', {
      global: undefined,
      environments: undefined,
    });
    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'dev-worktree', {
      global: undefined,
      environments: undefined,
    });
    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'dev-requirements', {
      global: undefined,
      environments: undefined,
    });
    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'dev-review', {
      global: undefined,
      environments: undefined,
    });
    expect(mockAddSkill).toHaveBeenCalledWith('codeaholicguy/ai-devkit', 'dev-pr', {
      global: undefined,
      environments: undefined,
    });
  });

  it('exits when skill add has neither registry nor --built-in', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'add']);

    expect(ui.error).toHaveBeenCalledWith('Missing registry. Use: ai-devkit skill add <registry>/<repo> [skill-name] or ai-devkit skill add --built-in');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockAddSkill).not.toHaveBeenCalled();
  });

  it('registers the add command with an optional skill-name argument', () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find(command => command.name() === 'skill');
    const addCommand = skillCommand?.commands.find(command => command.name() === 'add');

    expect(addCommand?.usage()).toContain('[registry-repo]');
    expect(addCommand?.usage()).toContain('[skill-name]');
  });

  it('lists global skills for selected environments with provenance', async () => {
    mockListGlobalSkills.mockResolvedValue([{
      name: 'frontend-design',
      environments: ['claude'],
      path: '~/.claude/skills/frontend-design',
    }]);
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'list', '--global', '--env', 'claude']);

    expect(mockListGlobalSkills).toHaveBeenCalledWith(['claude']);
    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Skill Name', 'Environments', 'Path'],
      rows: [['frontend-design', 'claude', '~/.claude/skills/frontend-design']],
    }));
  });

  it('preserves project-local list behavior when --global is absent', async () => {
    mockListSkills.mockResolvedValue([{
      name: 'frontend-design',
      registry: 'anthropics/skills',
      environments: ['cursor', 'claude'],
    }]);
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'list']);

    expect(mockListSkills).toHaveBeenCalledOnce();
    expect(mockListGlobalSkills).not.toHaveBeenCalled();
    expect(ui.text).toHaveBeenNthCalledWith(1, 'Installed Skills:', { breakline: true });
    expect(ui.table).toHaveBeenCalledWith(expect.objectContaining({
      headers: ['Skill Name', 'Registry', 'Environments'],
      rows: [['frontend-design', 'anthropics/skills', 'cursor, claude']],
    }));
    expect(ui.text).toHaveBeenNthCalledWith(2, 'Total: 1 skill(s)', { breakline: true });
  });

  it('rejects skill list --env unless --global is present', async () => {
    const program = new Command();
    registerSkillCommand(program);

    await program.parseAsync(['node', 'test', 'skill', 'list', '--env', 'claude']);

    expect(ui.error).toHaveBeenCalledWith('Failed to list skills: --env can only be used with --global');
    expect(process.exit).toHaveBeenCalledWith(1);
    expect(mockListGlobalSkills).not.toHaveBeenCalled();
  });

  it('documents global list filtering in command help', () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find(command => command.name() === 'skill');
    const listCommand = skillCommand?.commands.find(command => command.name() === 'list');

    expect(listCommand?.helpInformation()).toContain('--global');
    expect(listCommand?.helpInformation()).toContain('--env <environment...>');
    expect(listCommand?.helpInformation()).toMatch(/requires\s+--global/);
  });
});
