import * as fs from 'fs-extra';
import * as path from 'path';
import { loadInitTemplate } from '../../lib/InitTemplate';

jest.mock('fs-extra');

describe('InitTemplate', () => {
  const mockFs = fs as jest.Mocked<typeof fs>;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads YAML template from relative path', async () => {
    const cwdSpy = jest.spyOn(process, 'cwd').mockReturnValue('/repo');
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(`
version: 1
environments:
  - codex
phases:
  - requirements
skills:
  - registry: codeaholicguy/ai-devkit
    skill: debug
` as never);

    const result = await loadInitTemplate('init.yaml');

    expect(mockFs.pathExists).toHaveBeenCalledWith(path.resolve('/repo', 'init.yaml'));
    expect(result.environments).toEqual(['codex']);
    expect(result.phases).toEqual(['requirements']);
    expect(result.skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', skill: 'debug' }
    ]);

    cwdSpy.mockRestore();
  });

  it('loads JSON template from absolute path', async () => {
    const templatePath = '/tmp/init.json';
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(
      JSON.stringify({
        environments: ['claude'],
        phases: ['design'],
        skills: [{ registry: 'codeaholicguy/ai-devkit', skill: 'memory' }]
      }) as never
    );

    const result = await loadInitTemplate(templatePath);

    expect(mockFs.pathExists).toHaveBeenCalledWith(templatePath);
    expect(result.environments).toEqual(['claude']);
    expect(result.phases).toEqual(['design']);
    expect(result.skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', skill: 'memory' }
    ]);
  });

  it('supports multiple skills in the same registry', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(`
skills:
  - registry: codeaholicguy/ai-devkit
    skill: debug
  - registry: codeaholicguy/ai-devkit
    skill: memory
` as never);

    const result = await loadInitTemplate('/tmp/init.yaml');

    expect(result.skills).toEqual([
      { registry: 'codeaholicguy/ai-devkit', skill: 'debug' },
      { registry: 'codeaholicguy/ai-devkit', skill: 'memory' }
    ]);
  });

  it('throws actionable validation error for invalid environment', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(`
environments:
  - invalid-env
` as never);

    await expect(loadInitTemplate('/tmp/init.yaml')).rejects.toThrow(
      'Invalid template at /tmp/init.yaml: "environments[0]" has invalid value "invalid-env"'
    );
  });

  it('throws when unknown field exists', async () => {
    mockFs.pathExists.mockResolvedValue(true as never);
    mockFs.readFile.mockResolvedValue(`
foo: bar
` as never);

    await expect(loadInitTemplate('/tmp/init.yaml')).rejects.toThrow(
      'Invalid template at /tmp/init.yaml: unknown field(s): foo'
    );
  });

  it('throws when template file does not exist', async () => {
    mockFs.pathExists.mockResolvedValue(false as never);

    await expect(loadInitTemplate('/tmp/missing.yaml')).rejects.toThrow(
      'Template file not found: /tmp/missing.yaml'
    );
  });
});
