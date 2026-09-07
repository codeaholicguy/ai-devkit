import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import {
  discoverRegistrySkills,
  LOCAL_REGISTRY_MAX_ENTRIES,
  LOCAL_REGISTRY_MAX_SKILL_MD_BYTES,
  resolveContainedSkill,
} from '../../util/local-registry.js';

describe('local registry filesystem boundary', () => {
  let temp: string;
  let root: string;
  beforeEach(async () => {
    temp = await fs.mkdtemp(path.join(os.tmpdir(), 'local-registry-'));
    root = path.join(temp, 'registry');
    await fs.outputFile(path.join(root, 'skills', 'safe-skill', 'SKILL.md'), '---\ndescription: safe\n---');
  });
  afterEach(async () => fs.remove(temp));

  it('discovers direct valid skills within explicit bounds', async () => {
    await fs.outputFile(path.join(root, 'nested', 'skills', 'hidden', 'SKILL.md'), 'hidden');
    await expect(discoverRegistrySkills('test/skills', root)).resolves.toEqual([
      expect.objectContaining({ name: 'safe-skill' }),
    ]);
  });

  it('bounds direct-entry enumeration at the production limit', async () => {
    const opendir = vi.spyOn(fs, 'opendir').mockResolvedValue({
      async *[Symbol.asyncIterator]() {
        for (let index = 0; index <= LOCAL_REGISTRY_MAX_ENTRIES; index += 1) {
          yield { name: 'invalid_name', isDirectory: () => true, isSymbolicLink: () => false };
        }
      },
    } as Awaited<ReturnType<typeof fs.opendir>>);

    await expect(discoverRegistrySkills('test/skills', root)).rejects.toThrow(/entry limit/i);
    opendir.mockRestore();
  });

  it('bounds metadata reads at the production limit', async () => {
    await fs.writeFile(
      path.join(root, 'skills', 'safe-skill', 'SKILL.md'),
      Buffer.alloc(LOCAL_REGISTRY_MAX_SKILL_MD_BYTES + 1),
    );
    await expect(discoverRegistrySkills('test/skills', root)).rejects.toThrow(/too large/i);
  });

  it('rejects skill and metadata symlinks that escape the registry', async () => {
    const outside = path.join(temp, 'outside');
    await fs.outputFile(path.join(outside, 'SKILL.md'), 'outside');
    await fs.symlink(outside, path.join(root, 'skills', 'escape-skill'), 'dir');
    await expect(resolveContainedSkill('test/skills', root, 'escape-skill')).rejects.toThrow(/outside/i);

    const metadataEscape = path.join(root, 'skills', 'metadata-escape');
    await fs.ensureDir(metadataEscape);
    await fs.symlink(path.join(outside, 'SKILL.md'), path.join(metadataEscape, 'SKILL.md'));
    await expect(resolveContainedSkill('test/skills', root, 'metadata-escape')).rejects.toThrow(/outside/i);
  });

  it('rejects oversized metadata on an explicit skill install path', async () => {
    await fs.writeFile(
      path.join(root, 'skills', 'safe-skill', 'SKILL.md'),
      Buffer.alloc(LOCAL_REGISTRY_MAX_SKILL_MD_BYTES + 1),
    );
    await expect(resolveContainedSkill('test/skills', root, 'safe-skill')).rejects.toThrow(/too large/i);
  });
});
