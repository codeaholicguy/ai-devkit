import * as fs from 'fs-extra';
import * as path from 'path';
import { TemplateManager } from '../../lib/TemplateManager';
import { EnvironmentDefinition, Phase, EnvironmentCode } from '../../types';

jest.mock('fs-extra');
jest.mock('../../util/env');

describe('TemplateManager', () => {
  let templateManager: TemplateManager;
  let mockFs: jest.Mocked<typeof fs>;
  let mockGetEnvironment: jest.MockedFunction<any>;

  beforeEach(() => {
    mockFs = fs as jest.Mocked<typeof fs>;
    mockGetEnvironment = require('../../util/env').getEnvironment as jest.MockedFunction<any>;
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

  describe('copyPhaseTemplate', () => {
    it('should copy phase template and return target file path', async () => {
      const phase: Phase = 'requirements';

      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.copy as any).mockResolvedValue(undefined);

      const result = await templateManager.copyPhaseTemplate(phase);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], 'docs', 'ai', phase)
      );
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'phases', `${phase}.md`),
        path.join(templateManager['targetDir'], 'docs', 'ai', phase, 'README.md')
      );
      expect(result).toBe(path.join(templateManager['targetDir'], 'docs', 'ai', phase, 'README.md'));
    });
  });

  describe('fileExists', () => {
    it('should return true when phase file exists', async () => {
      const phase: Phase = 'design';

      (mockFs.pathExists as any).mockResolvedValue(true);

      const result = await templateManager.fileExists(phase);

      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], 'docs', 'ai', phase, 'README.md')
      );
      expect(result).toBe(true);
    });

    it('should return false when phase file does not exist', async () => {
      const phase: Phase = 'planning';

      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await templateManager.fileExists(phase);

      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], 'docs', 'ai', phase, 'README.md')
      );
      expect(result).toBe(false);
    });
  });

  describe('setupMultipleEnvironments', () => {
    it('should setup multiple environments successfully', async () => {
      const envIds: EnvironmentCode[] = ['cursor', 'gemini'];
      const cursorEnv = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };
      const geminiEnv = {
        code: 'gemini',
        name: 'Gemini',
        contextFileName: 'AGENTS.md',
        commandPath: '.gemini/commands',
        isCustomCommandPath: true,
      };

      mockGetEnvironment
        .mockReturnValueOnce(cursorEnv)
        .mockReturnValueOnce(geminiEnv);

      // Mock setupSingleEnvironment
      const mockSetupSingleEnvironment = jest.fn();
      mockSetupSingleEnvironment
        .mockResolvedValueOnce(['/path/to/cursor/file1', '/path/to/cursor/file2'])
        .mockResolvedValueOnce(['/path/to/gemini/file1']);

      (templateManager as any).setupSingleEnvironment = mockSetupSingleEnvironment;

      const result = await templateManager.setupMultipleEnvironments(envIds);

      expect(mockGetEnvironment).toHaveBeenCalledWith('cursor');
      expect(mockGetEnvironment).toHaveBeenCalledWith('gemini');
      expect(mockSetupSingleEnvironment).toHaveBeenCalledWith(cursorEnv);
      expect(mockSetupSingleEnvironment).toHaveBeenCalledWith(geminiEnv);
      expect(result).toEqual([
        '/path/to/cursor/file1',
        '/path/to/cursor/file2',
        '/path/to/gemini/file1'
      ]);
    });

    it('should skip invalid environments and continue with valid ones', async () => {
      const envIds: EnvironmentCode[] = ['cursor', 'invalid' as any, 'gemini'];
      const cursorEnv = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };
      const geminiEnv = {
        code: 'gemini',
        name: 'Gemini',
        contextFileName: 'AGENTS.md',
        commandPath: '.gemini/commands',
        isCustomCommandPath: true,
      };

      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockGetEnvironment
        .mockReturnValueOnce(cursorEnv)
        .mockReturnValueOnce(undefined) // invalid environment
        .mockReturnValueOnce(geminiEnv);

      // Mock setupSingleEnvironment
      const mockSetupSingleEnvironment = jest.fn();
      mockSetupSingleEnvironment
        .mockResolvedValueOnce(['/path/to/cursor/file1'])
        .mockResolvedValueOnce(['/path/to/gemini/file1']);

      (templateManager as any).setupSingleEnvironment = mockSetupSingleEnvironment;

      const result = await templateManager.setupMultipleEnvironments(envIds);

      expect(consoleWarnSpy).toHaveBeenCalledWith("Warning: Environment 'invalid' not found, skipping");
      expect(result).toEqual([
        '/path/to/cursor/file1',
        '/path/to/gemini/file1'
      ]);

      consoleWarnSpy.mockRestore();
    });

    it('should throw error when setupSingleEnvironment fails', async () => {
      const envIds: EnvironmentCode[] = ['cursor'];
      const cursorEnv = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(cursorEnv);

      const mockSetupSingleEnvironment = jest.fn().mockRejectedValue(new Error('Setup failed'));
      (templateManager as any).setupSingleEnvironment = mockSetupSingleEnvironment;

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(templateManager.setupMultipleEnvironments(envIds)).rejects.toThrow('Setup failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith("Error setting up environment 'Cursor':", expect.any(Error));

      consoleErrorSpy.mockRestore();
    });
  });

  describe('checkEnvironmentExists', () => {
    it('should return false when environment does not exist', async () => {
      const envId: EnvironmentCode = 'cursor';

      mockGetEnvironment.mockReturnValue(undefined);

      const result = await templateManager.checkEnvironmentExists(envId);

      expect(mockGetEnvironment).toHaveBeenCalledWith(envId);
      expect(result).toBe(false);
    });

    it('should return true when context file exists', async () => {
      const envId: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(true) // context file exists
        .mockResolvedValueOnce(false); // command dir doesn't exist

      const result = await templateManager.checkEnvironmentExists(envId);

      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.contextFileName)
      );
      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.commandPath)
      );
      expect(result).toBe(true);
    });

    it('should return true when command directory exists', async () => {
      const envId: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(false) // context file doesn't exist
        .mockResolvedValueOnce(true); // command dir exists

      const result = await templateManager.checkEnvironmentExists(envId);

      expect(result).toBe(true);
    });

    it('should return false when neither context file nor command directory exists', async () => {
      const envId: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(false) // context file doesn't exist
        .mockResolvedValueOnce(false); // command dir doesn't exist

      const result = await templateManager.checkEnvironmentExists(envId);

      expect(result).toBe(false);
    });
  });
});
