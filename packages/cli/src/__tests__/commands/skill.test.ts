import { Command } from 'commander';

import { registerSkillCommand } from '../../commands/skill.js';
import { ui } from '../../util/terminal-ui.js';

const mockAddSkill = vi.fn();

vi.mock('../../lib/Config.js', () => ({
  ConfigManager: vi.fn(),
}));

vi.mock('../../lib/SkillManager.js', () => ({
  SkillManager: vi.fn(function () { return {
    addSkill: (...args: unknown[]) => mockAddSkill(...args),
    listSkills: vi.fn(),
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
});
