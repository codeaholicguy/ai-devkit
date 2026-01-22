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
        .mockResolvedValueOnce(true).mockResolvedValueOnce(true);

      (mockFs.readdir as any)
        .mockResolvedValueOnce([]).mockResolvedValueOnce(mockRuleFiles);
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

      const mockCommandFiles = ['command1.md', 'command2.md'];
      const mockMdContent = `---
description: Test command description
---

# Test Command

This is the prompt content.`;

      (mockFs.pathExists as any)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      (mockFs.readdir as any).mockResolvedValue(mockCommandFiles);
      (mockFs.readFile as any).mockResolvedValue(mockMdContent);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands')
      );

      // Should write generated TOML files, not copy them
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'command1.toml'),
        expect.stringContaining("description='''Test command description'''")
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'command2.toml'),
        expect.stringContaining("prompt='''# Test Command")
      );

      expect(result).toContain(path.join(templateManager['targetDir'], '.gemini', 'commands', 'command1.toml'));
      expect(result).toContain(path.join(templateManager['targetDir'], '.gemini', 'commands', 'command2.toml'));
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

  describe('generateTomlContent', () => {
    it('should generate valid TOML with description and prompt', () => {
      const description = 'Test command description';
      const prompt = '# Test Command\n\nThis is the prompt content.';

      const result = (templateManager as any).generateTomlContent(description, prompt);

      expect(result).toBe(`description='''Test command description'''
prompt='''# Test Command

This is the prompt content.'''
`);
    });

    it('should handle empty description', () => {
      const description = '';
      const prompt = '# Command without description';

      const result = (templateManager as any).generateTomlContent(description, prompt);

      expect(result).toContain("description=''''''");
      expect(result).toContain("prompt='''# Command without description'''");
    });

    it('should handle multi-line description', () => {
      const description = 'This is a multi-line\ndescription for testing';
      const prompt = '# Test';

      const result = (templateManager as any).generateTomlContent(description, prompt);

      expect(result).toContain("description='''This is a multi-line\ndescription for testing'''");
    });

    it('should handle complex prompt with markdown formatting', () => {
      const description = 'Complex command';
      const prompt = `# Title

## Step 1: Do something
- Item 1
- Item 2

\`\`\`bash
echo "hello"
\`\`\`

Let me know when ready.`;

      const result = (templateManager as any).generateTomlContent(description, prompt);

      expect(result).toContain("prompt='''# Title");
      expect(result).toContain('## Step 1: Do something');
      expect(result).toContain('```bash');
      expect(result).toContain("Let me know when ready.'''");
    });

    it('should handle special characters in content', () => {
      const description = "Command with 'quotes' and \"double quotes\"";
      const prompt = 'Test with special chars: <>&';

      const result = (templateManager as any).generateTomlContent(description, prompt);

      expect(result).toContain("description='''Command with 'quotes' and \"double quotes\"'''");
      expect(result).toContain("prompt='''Test with special chars: <>&'''");
    });
  });

  describe('copyGeminiSpecificFiles integration', () => {
    it('should generate TOML files from MD files with frontmatter', async () => {
      const mdContentWithFrontmatter = `---
description: Capture knowledge about code
---

# Knowledge Capture

Help me capture knowledge.`;

      (mockFs.readdir as any).mockResolvedValue(['capture-knowledge.md']);
      (mockFs.readFile as any).mockResolvedValue(mdContentWithFrontmatter);
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const copiedFiles: string[] = [];
      await (templateManager as any).copyGeminiSpecificFiles(copiedFiles);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'capture-knowledge.toml'),
        expect.stringContaining("description='''Capture knowledge about code'''")
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'capture-knowledge.toml'),
        expect.stringContaining("prompt='''# Knowledge Capture")
      );
      expect(copiedFiles).toContain(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'capture-knowledge.toml')
      );
    });

    it('should handle MD files without frontmatter', async () => {
      const mdContentWithoutFrontmatter = `# Simple Command

This is a command without frontmatter.`;

      (mockFs.readdir as any).mockResolvedValue(['simple.md']);
      (mockFs.readFile as any).mockResolvedValue(mdContentWithoutFrontmatter);
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const copiedFiles: string[] = [];
      await (templateManager as any).copyGeminiSpecificFiles(copiedFiles);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'simple.toml'),
        expect.stringContaining("description=''''''")
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'simple.toml'),
        expect.stringContaining("prompt='''# Simple Command")
      );
    });

    it('should only process .md files and ignore other extensions', async () => {
      const mdContent = `---
description: Test
---
# Test`;

      (mockFs.readdir as any).mockResolvedValue(['command.md', 'readme.txt', 'config.json']);
      (mockFs.readFile as any).mockResolvedValue(mdContent);
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const copiedFiles: string[] = [];
      await (templateManager as any).copyGeminiSpecificFiles(copiedFiles);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.gemini', 'commands', 'command.toml'),
        expect.any(String)
      );
    });
  });

  describe('copyCommandsToGlobal', () => {
    const mockOs = {
      homedir: jest.fn()
    };

    beforeEach(() => {
      jest.doMock('os', () => mockOs);
      mockOs.homedir.mockReturnValue('/home/testuser');
    });

    it('should throw error for environment without global support', async () => {
      const envWithoutGlobal = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
        // No globalCommandPath
      };

      mockGetEnvironment.mockReturnValue(envWithoutGlobal);

      await expect(templateManager.copyCommandsToGlobal('cursor')).rejects.toThrow(
        "Environment 'cursor' does not support global setup"
      );
    });

    it('should throw error for invalid environment code', async () => {
      mockGetEnvironment.mockReturnValue(undefined);

      await expect(templateManager.copyCommandsToGlobal('invalid' as any)).rejects.toThrow(
        "Environment 'invalid' does not support global setup"
      );
    });

    it('should create global directory and copy command files', async () => {
      const envWithGlobal = {
        code: 'antigravity',
        name: 'Antigravity',
        contextFileName: 'AGENTS.md',
        commandPath: '.agent/workflows',
        globalCommandPath: '.gemini/antigravity/global_workflows',
      };

      const mockCommandFiles = ['command1.md', 'command2.md', 'readme.txt'];

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.readdir as any).mockResolvedValue(mockCommandFiles);
      (mockFs.copy as any).mockResolvedValue(undefined);

      const result = await templateManager.copyCommandsToGlobal('antigravity');

      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.copy).toHaveBeenCalledTimes(2); // Only .md files
      expect(result).toHaveLength(2);
    });

    it('should only copy .md files and ignore other extensions', async () => {
      const envWithGlobal = {
        code: 'codex',
        name: 'OpenAI Codex',
        contextFileName: 'AGENTS.md',
        commandPath: '.codex/commands',
        globalCommandPath: '.codex/prompts',
      };

      const mockCommandFiles = ['command.md', 'readme.txt', 'config.json', 'test.toml'];

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.readdir as any).mockResolvedValue(mockCommandFiles);
      (mockFs.copy as any).mockResolvedValue(undefined);

      const result = await templateManager.copyCommandsToGlobal('codex');

      expect(mockFs.copy).toHaveBeenCalledTimes(1);
      expect(result).toHaveLength(1);
    });

    it('should handle file system errors gracefully', async () => {
      const envWithGlobal = {
        code: 'antigravity',
        name: 'Antigravity',
        contextFileName: 'AGENTS.md',
        commandPath: '.agent/workflows',
        globalCommandPath: '.gemini/antigravity/global_workflows',
      };

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.ensureDir as any).mockRejectedValue(new Error('Permission denied'));

      await expect(templateManager.copyCommandsToGlobal('antigravity')).rejects.toThrow(
        'Failed to copy commands to global folder: Permission denied'
      );
    });
  });

  describe('checkGlobalCommandsExist', () => {
    it('should return false for environment without global support', async () => {
      const envWithoutGlobal = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(envWithoutGlobal);

      const result = await templateManager.checkGlobalCommandsExist('cursor');

      expect(result).toBe(false);
    });

    it('should return false for invalid environment code', async () => {
      mockGetEnvironment.mockReturnValue(undefined);

      const result = await templateManager.checkGlobalCommandsExist('invalid' as any);

      expect(result).toBe(false);
    });

    it('should return false when global folder does not exist', async () => {
      const envWithGlobal = {
        code: 'antigravity',
        name: 'Antigravity',
        contextFileName: 'AGENTS.md',
        commandPath: '.agent/workflows',
        globalCommandPath: '.gemini/antigravity/global_workflows',
      };

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.pathExists as any).mockResolvedValue(false);

      const result = await templateManager.checkGlobalCommandsExist('antigravity');

      expect(result).toBe(false);
    });

    it('should return false when global folder is empty', async () => {
      const envWithGlobal = {
        code: 'antigravity',
        name: 'Antigravity',
        contextFileName: 'AGENTS.md',
        commandPath: '.agent/workflows',
        globalCommandPath: '.gemini/antigravity/global_workflows',
      };

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readdir as any).mockResolvedValue([]);

      const result = await templateManager.checkGlobalCommandsExist('antigravity');

      expect(result).toBe(false);
    });

    it('should return false when folder contains only non-.md files', async () => {
      const envWithGlobal = {
        code: 'antigravity',
        name: 'Antigravity',
        contextFileName: 'AGENTS.md',
        commandPath: '.agent/workflows',
        globalCommandPath: '.gemini/antigravity/global_workflows',
      };

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readdir as any).mockResolvedValue(['readme.txt', 'config.json']);

      const result = await templateManager.checkGlobalCommandsExist('antigravity');

      expect(result).toBe(false);
    });

    it('should return true when global folder contains .md files', async () => {
      const envWithGlobal = {
        code: 'antigravity',
        name: 'Antigravity',
        contextFileName: 'AGENTS.md',
        commandPath: '.agent/workflows',
        globalCommandPath: '.gemini/antigravity/global_workflows',
      };

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readdir as any).mockResolvedValue(['command1.md', 'command2.md']);

      const result = await templateManager.checkGlobalCommandsExist('antigravity');

      expect(result).toBe(true);
    });

    it('should return true when folder has mixed files including .md', async () => {
      const envWithGlobal = {
        code: 'codex',
        name: 'OpenAI Codex',
        contextFileName: 'AGENTS.md',
        commandPath: '.codex/commands',
        globalCommandPath: '.codex/prompts',
      };

      mockGetEnvironment.mockReturnValue(envWithGlobal);
      (mockFs.pathExists as any).mockResolvedValue(true);
      (mockFs.readdir as any).mockResolvedValue(['readme.txt', 'command.md', 'config.json']);

      const result = await templateManager.checkGlobalCommandsExist('codex');

      expect(result).toBe(true);
    });
  });
});
