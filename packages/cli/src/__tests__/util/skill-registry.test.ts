import fs from 'fs-extra';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  normalizeRegistrySourceInput,
  normalizeRegistrySources,
  parseRegistrySource,
  planSkillRegistryAdd,
  planSkillRegistryRemove,
} from '../../util/skill-registry.js';

describe('registry sources', () => {
  it('classifies only file URLs as persisted local sources', () => {
    expect(parseRegistrySource('https://example.com/skills.git')).toEqual({
      type: 'git', value: 'https://example.com/skills.git',
    });
    expect(parseRegistrySource('git@example.com:org/skills.git').type).toBe('git');
    expect(parseRegistrySource('file:///tmp/skills')).toEqual({
      type: 'local', value: 'file:///tmp/skills', path: '/tmp/skills',
    });
  });

  it('rejects malformed and hosted file URLs instead of treating them as Git', () => {
    expect(() => parseRegistrySource('file://remote/share')).toThrow(/host/i);
    expect(() => parseRegistrySource('file:%')).toThrow(/local registry/i);
  });

  it('canonicalizes absolute and relative path input at registration time', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-source-'));
    const root = path.join(temp, 'registry');
    await fs.ensureDir(path.join(root, 'skills'));
    const alias = path.join(temp, 'alias');
    await fs.symlink(root, alias, 'dir');

    try {
      const expected = pathToFileURL(await fs.realpath(root)).href;
      expect(await normalizeRegistrySourceInput(root, temp)).toBe(expected);
      expect(await normalizeRegistrySourceInput('./registry/', temp)).toBe(expected);
      expect(await normalizeRegistrySourceInput('../alias', path.join(temp, 'child'))).toBe(expected);
      expect(await normalizeRegistrySourceInput(pathToFileURL(alias).href, temp)).toBe(expected);
      expect(await normalizeRegistrySourceInput('https://example.com/skills.git', temp))
        .toBe('https://example.com/skills.git');
    } finally {
      await fs.remove(temp);
    }
  });

  it('reports missing and non-directory local sources clearly', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-source-'));
    const file = path.join(temp, 'file');
    await fs.writeFile(file, 'x');
    try {
      await expect(normalizeRegistrySourceInput('./missing', temp)).rejects.toThrow(/not found/i);
      await expect(normalizeRegistrySourceInput(file, temp)).rejects.toThrow(/not a directory/i);
    } finally {
      await fs.remove(temp);
    }
  });

  it('rejects duplicate canonical local folders under different IDs', async () => {
    const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'registry-source-'));
    await fs.ensureDir(path.join(temp, 'skills'));
    try {
      const source = pathToFileURL(temp).href;
      await expect(normalizeRegistrySources({
        'one/skills': source,
        'two/skills': `${source}/`,
      }, process.cwd())).rejects.toThrow(/already registered as "one\/skills"/i);
    } finally {
      await fs.remove(temp);
    }
  });
});

describe('planSkillRegistryAdd', () => {
  it('covers existing add planner states used by the shared module', () => {
    expect(planSkillRegistryAdd({}, 'new/skills', 'url')).toEqual({
      registries: { 'new/skills': 'url' }, status: 'added',
    });
    const existing = { 'new/skills': 'url' };
    expect(planSkillRegistryAdd(existing, 'new/skills', 'url')).toEqual({ registries: existing, status: 'already-registered' });
    expect(planSkillRegistryAdd(existing, 'new/skills', 'new-url', { force: true })).toEqual({
      registries: { 'new/skills': 'new-url' }, status: 'updated',
    });
    expect(() => planSkillRegistryAdd(existing, 'new/skills', 'new-url')).toThrow('Use --force');
  });
});

describe('planSkillRegistryRemove', () => {
  it('removes an own registry entry without mutating the input', () => {
    const registries = { 'target/skills': 'target-url', 'keep/skills': 'keep-url' };

    expect(planSkillRegistryRemove(registries, 'target/skills')).toEqual({
      registries: { 'keep/skills': 'keep-url' },
      status: 'removed',
    });
    expect(registries).toEqual({ 'target/skills': 'target-url', 'keep/skills': 'keep-url' });
  });

  it('returns a copied map when the registry is not registered', () => {
    const registries = { 'keep/skills': 'keep-url' };
    const result = planSkillRegistryRemove(registries, 'missing/skills');

    expect(result).toEqual({ registries, status: 'not-registered' });
    expect(result.registries).not.toBe(registries);
  });

  it('does not treat an inherited registry as registered', () => {
    const registries = Object.create({ 'shadow/skills': 'inherited-url' }) as Record<string, string>;
    registries['keep/skills'] = 'keep-url';

    expect(planSkillRegistryRemove(registries, 'shadow/skills')).toEqual({
      registries: { 'keep/skills': 'keep-url' },
      status: 'not-registered',
    });
  });
});
