import * as fs from 'fs-extra';
import * as path from 'path';
import { TemplateManager } from '../../lib/TemplateManager';
import { EnvironmentDefinition } from '../../types';

jest.mock('fs-extra');

describe('TemplateManager', () => {
  let templateManager: TemplateManager;
  let mockFs: jest.Mocked<typeof fs>;

  beforeEach(() => {
    mockFs = fs as jest.Mocked<typeof fs>;
    templateManager = new TemplateManager('/test/target');

    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setupSingleEnvironment', () => {
    it('should copy context file when it exists', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      (mockFs.readdir as any).mockResolvedValue(['command1.md', 'command2.toml']);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'env', 'base.md'),
        path.join(templateManager['targetDir'], env.contextFileName)
      );
      expect(result).toContain(path.join(templateManager['targetDir'], env.contextFileName));
    });

    it('should warn when context file does not exist', async () => {
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      (mockFs.readdir as any).mockResolvedValue(['command1.md']);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Warning: Context file not found')
      );
      expect(result).toEqual([path.join(templateManager['targetDir'], env.commandPath, 'command1.md')]);

      consoleWarnSpy.mockRestore();
    });

    it('should copy commands when isCustomCommandPath is false', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      const mockCommandFiles = ['command1.md', 'command2.toml', 'command3.md'];

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(true) // context file exists
        .mockResolvedValueOnce(true); // commands directory exists

      (mockFs.readdir as any).mockResolvedValue(mockCommandFiles);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.commandPath)
      );

      // Should only copy .md files (not .toml files)
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'commands', 'command1.md'),
        path.join(templateManager['targetDir'], env.commandPath, 'command1.md')
      );
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'commands', 'command3.md'),
        path.join(templateManager['targetDir'], env.commandPath, 'command3.md')
      );

      expect(result).toContain(path.join(templateManager['targetDir'], env.commandPath, 'command1.md'));
      expect(result).toContain(path.join(templateManager['targetDir'], env.commandPath, 'command3.md'));
    });

    it('should skip commands when isCustomCommandPath is true', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: true
      };

      (mockFs.pathExists as any).mockResolvedValueOnce(true);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).not.toHaveBeenCalled();
      expect(mockFs.copy).toHaveBeenCalledTimes(1);
      expect(result).toContain(path.join(templateManager['targetDir'], env.contextFileName));
    });

    it('should handle cursor environment with special files', async () => {
      const env: EnvironmentDefinition = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: '.cursor.md',
        commandPath: '.cursor',
        isCustomCommandPath: false
      };

      const mockRuleFiles = ['rule1.md', 'rule2.toml'];

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)        .mockResolvedValueOnce(true);

      (mockFs.readdir as any)
        .mockResolvedValueOnce([])        .mockResolvedValueOnce(mockRuleFiles);
      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.cursor', 'rules')
      );
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'env', 'cursor', 'rules'),
        path.join(templateManager['targetDir'], '.cursor', 'rules')
      );

      expect(result).toContain(path.join(templateManager['targetDir'], '.cursor', 'rules', 'rule1.md'));
      expect(result).toContain(path.join(templateManager['targetDir'], '.cursor', 'rules', 'rule2.toml'));
    });

    it('should handle gemini environment with toml files', async () => {
      const env: EnvironmentDefinition = {
        code: 'gemini',
        name: 'Gemini',
        contextFileName: '.gemini.md',
        commandPath: '.gemini',
        isCustomCommandPath: false
      };

      const mockCommandFiles = ['command1.md', 'command2.toml', 'command3.toml'];

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)        .mockResolvedValueOnce(true); // gemini commands directory exists

      (mockFs.readdir as any).mockResolvedValue(mockCommandFiles);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands')
      );

      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'commands', 'command2.toml'),
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'command2.toml')
      );
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'commands', 'command3.toml'),
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'command3.toml')
      );

      expect(result).toContain(path.join(templateManager['targetDir'], '.gemini', 'commands', 'command2.toml'));
      expect(result).toContain(path.join(templateManager['targetDir'], '.gemini', 'commands', 'command3.toml'));
    });

    it('should handle errors and rethrow them', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      const testError = new Error('Test error');
      (mockFs.pathExists as any).mockRejectedValue(testError);

      await expect((templateManager as any).setupSingleEnvironment(env)).rejects.toThrow('Test error');

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error setting up environment Test Environment:',
        testError
      );

      consoleErrorSpy.mockRestore();
    });
  });
});
