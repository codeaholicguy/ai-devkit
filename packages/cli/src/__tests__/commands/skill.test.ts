import { Command } from 'commander';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { registerSkillCommand } from '../../commands/skill';
import { ui } from '../../util/terminal-ui';

const mockAddSkill = jest.fn();

jest.mock('../../lib/Config', () => ({
  ConfigManager: jest.fn(),
}));

jest.mock('../../lib/SkillManager', () => ({
  SkillManager: jest.fn(() => ({
    addSkill: (...args: unknown[]) => mockAddSkill(...args),
    listSkills: jest.fn(),
    removeSkill: jest.fn(),
    updateSkills: jest.fn(),
    findSkills: jest.fn(),
    rebuildIndex: jest.fn(),
  })),
}));

jest.mock('../../util/terminal-ui', () => ({
  ui: {
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
    text: jest.fn(),
    table: jest.fn(),
  },
}));

describe('skill command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddSkill.mockImplementation(async () => undefined);
    jest.spyOn(process, 'exit').mockImplementation((() => undefined) as any);
    jest.spyOn(process.stderr, 'write').mockImplementation((() => true) as any);
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

  it('registers the add command with an optional skill-name argument', () => {
    const program = new Command();
    registerSkillCommand(program);

    const skillCommand = program.commands.find(command => command.name() === 'skill');
    const addCommand = skillCommand?.commands.find(command => command.name() === 'add');

    expect(addCommand?.usage()).toContain('<registry-repo>');
    expect(addCommand?.usage()).toContain('[skill-name]');
  });
});
