import { validateInstallConfig } from '../../util/config';

describe('config util', () => {
  it('validates and normalizes valid install config', () => {
    const result = validateInstallConfig({
      environments: ['codex', 'codex'],
      phases: ['requirements', 'requirements', 'design'],
      skills: [
        { registry: 'codeaholicguy/ai-devkit', name: 'debug' },
        { registry: 'codeaholicguy/ai-devkit', skill: 'memory' },
        { registry: 'codeaholicguy/ai-devkit', name: 'debug' }
      ]
    }, '/tmp/.ai-devkit.json');

    expect(result.environments).toEqual(['codex']);
    expect(result.phases).toEqual(['requirements', 'design']);
    expect(result.skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', name: 'debug' },
      { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
    ]);
  });

  it('fails on invalid root value', () => {
    expect(() => validateInstallConfig([], '/tmp/.ai-devkit.json')).toThrow('expected a JSON object at root');
  });

  it('fails on invalid environment code', () => {
    expect(() => validateInstallConfig({ environments: ['bad-env'] }, '/tmp/.ai-devkit.json')).toThrow('environments[0] has unsupported value "bad-env"');
  });

  it('fails when skills entry is invalid', () => {
    expect(() => validateInstallConfig({ skills: [{ registry: '', name: 'debug' }] }, '/tmp/.ai-devkit.json')).toThrow('skills[0].registry');
  });

  it('accepts skills as an object with installed array (issue #62)', () => {
    const result = validateInstallConfig({
      environments: ['claude'],
      skills: {
        installed: [
          { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' }
        ]
      }
    }, '/tmp/.ai-devkit.json');

    expect(result.skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', name: 'dev-lifecycle' }
    ]);
  });

  it('accepts skills as an object with registries and installed array', () => {
    const result = validateInstallConfig({
      skills: {
        registries: { myorg: 'myorg/skills' },
        installed: [
          { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
        ]
      }
    }, '/tmp/.ai-devkit.json');

    expect(result.skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', name: 'memory' }
    ]);
  });
});
