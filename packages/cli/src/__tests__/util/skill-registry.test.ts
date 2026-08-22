import { planSkillRegistryAdd, planSkillRegistryRemove } from '../../util/skill-registry.js';

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
      removedUrl: 'target-url',
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
