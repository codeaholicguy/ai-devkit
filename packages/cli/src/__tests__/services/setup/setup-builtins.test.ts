import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { mockAddSkill, mockGetBuiltinSkillNames } = vi.hoisted(() => ({
  mockAddSkill: vi.fn(),
  mockGetBuiltinSkillNames: vi.fn(),
}));

vi.mock('../../../lib/SkillManager.js', () => ({
  SkillManager: vi.fn(function () {
    return { addSkill: (...args: unknown[]) => mockAddSkill(...args) };
  }),
}));

vi.mock('../../../lib/BuiltinSkills.js', () => ({
  BUILTIN_SKILL_REGISTRY: 'codeaholicguy/ai-devkit',
  getBuiltinSkillNames: (...args: unknown[]) => mockGetBuiltinSkillNames(...args),
}));

import { createSetupService } from '../../../services/setup/setup.service.js';

describe('setup built-in skills', () => {
  let homeDir: string;
  let assetRoot: string;

  beforeEach(() => {
    homeDir = mkdtempSync(join(tmpdir(), 'ai-devkit-setup-builtins-home-'));
    assetRoot = mkdtempSync(join(tmpdir(), 'ai-devkit-setup-builtins-assets-'));
    mkdirSync(join(homeDir, '.claude'), { recursive: true });
    mkdirSync(join(assetRoot, 'claude'), { recursive: true });
    writeFileSync(join(assetRoot, 'claude', 'claude-prompt-hook.js'), '// hook');
    writeFileSync(join(assetRoot, 'claude', 'settings-hook.json'), JSON.stringify({
      hooks: [{ type: 'command', command: 'echo hook' }],
    }));
    mockAddSkill.mockReset();
    mockAddSkill.mockResolvedValue('installed');
    mockGetBuiltinSkillNames.mockReset();
    mockGetBuiltinSkillNames.mockResolvedValue(['remote-one', 'remote-two']);
  });

  afterEach(() => {
    rmSync(homeDir, { recursive: true, force: true });
    rmSync(assetRoot, { recursive: true, force: true });
  });

  it('installs every runtime built-in for the selected agent', async () => {
    const service = createSetupService({ homeDir, assetRoot });

    await service.run({ agents: ['claude'] });

    expect(mockGetBuiltinSkillNames).toHaveBeenCalledOnce();
    expect(mockAddSkill).toHaveBeenCalledTimes(2);
    expect(mockAddSkill).toHaveBeenNthCalledWith(
      1,
      'codeaholicguy/ai-devkit',
      'remote-one',
      { global: true, environments: ['claude'] }
    );
    expect(mockAddSkill).toHaveBeenNthCalledWith(
      2,
      'codeaholicguy/ai-devkit',
      'remote-two',
      { global: true, environments: ['claude'] }
    );
  });
});
