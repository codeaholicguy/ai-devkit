import type { MockedFunction, Mocked } from 'vitest';
import fs from 'fs-extra';
import * as path from 'path';
import { TemplateManager } from '../../lib/TemplateManager.js';
import * as envModule from '../../util/env.js';
import { EnvironmentDefinition, Phase, EnvironmentCode } from '../../types.js';

vi.mock('fs-extra', async () => { const { makeFsExtraMock } = await import('../__shared__/fs-extra-mock.js'); return makeFsExtraMock(); });
vi.mock('../../util/env.js');

vi.mock('../../util/terminal-ui.js', () => ({
  ui: { warning: vi.fn(), error: vi.fn(), info: vi.fn(), text: vi.fn() },
}));
import { ui as mockUi } from '../../util/terminal-ui.js';

describe('TemplateManager', () => {
  let templateManager: TemplateManager;
  let mockFs: Mocked<typeof fs>;
  let mockGetEnvironment: MockedFunction<any>;

  beforeEach(() => {
    mockFs = fs as Mocked<typeof fs>;
    mockGetEnvironment = envModule.getEnvironment as MockedFunction<any>;
    templateManager = new TemplateManager({ targetDir: '/test/target' });

    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('setupSingleEnvironment', () => {
    it('should not copy context files', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      (mockFs.pathExists as any).mockResolvedValueOnce(true);

      (mockFs.readdir as any).mockResolvedValue(['command1.md', 'command2.toml']);
      (mockFs.readFile as any).mockResolvedValue('command content');
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      expect(result).toEqual([path.join(templateManager['targetDir'], env.commandPath, 'command1.md')]);
    });

    it('should not warn for missing context file', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      (mockFs.pathExists as any).mockResolvedValueOnce(true);

      (mockFs.readdir as any).mockResolvedValue(['command1.md']);
      (mockFs.readFile as any).mockResolvedValue('command content');
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockUi.warning).not.toHaveBeenCalled();
      expect(result).toEqual([path.join(templateManager['targetDir'], env.commandPath, 'command1.md')]);
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

      (mockFs.pathExists as any).mockResolvedValueOnce(true); // commands directory exists

      (mockFs.readdir as any).mockResolvedValue(mockCommandFiles);
      (mockFs.readFile as any).mockResolvedValue('command content');
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.commandPath)
      );

      // Should only write .md files (not .toml files)
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.commandPath, 'command1.md'),
        'command content'
      );
      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.commandPath, 'command3.md'),
        'command content'
      );

      expect(result).toContain(path.join(templateManager['targetDir'], env.commandPath, 'command1.md'));
      expect(result).toContain(path.join(templateManager['targetDir'], env.commandPath, 'command3.md'));
    });

    it('should replace docs/ai with custom docsDir in command content', async () => {
      const customManager = new TemplateManager({ targetDir: '/test/target', docsDir: '.ai-docs' });
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      (mockFs.pathExists as any).mockResolvedValueOnce(true);
      (mockFs.readdir as any).mockResolvedValue(['command1.md']);
      (mockFs.readFile as any).mockResolvedValue('Review {{docsDir}}/design/feature-{name}.md and {{docsDir}}/requirements/.');
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      await (customManager as any).setupSingleEnvironment(env);

      expect(mockFs.writeFile).toHaveBeenCalledWith(
        path.join(customManager['targetDir'], env.commandPath, 'command1.md'),
        'Review .ai-docs/design/feature-{name}.md and .ai-docs/requirements/.'
      );
    });

    it('should skip commands when isCustomCommandPath is true', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: true
      };

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).not.toHaveBeenCalled();
      expect(mockFs.copy).not.toHaveBeenCalled();
      expect(result).toEqual([]);
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
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
        contextFileName: '.test-context.md',
        commandPath: '.test',
        isCustomCommandPath: false
      };

      (mockFs.pathExists as any).mockResolvedValueOnce(true);
      (mockFs.readdir as any).mockRejectedValue(new Error('Test error'));

      await expect((templateManager as any).setupSingleEnvironment(env)).rejects.toThrow('Test error');

      expect(mockUi.error).toHaveBeenCalledWith(
        "Error setting up environment 'Test Environment': Test error"
      );
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

    it('should use custom docsDir when provided', async () => {
      const customManager = new TemplateManager({ targetDir: '/test/target', docsDir: '.ai-docs' });
      const phase: Phase = 'design';

      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.copy as any).mockResolvedValue(undefined);

      const result = await customManager.copyPhaseTemplate(phase);

      expect(mockFs.ensureDir).toHaveBeenCalledWith(
        path.join(customManager['targetDir'], '.ai-docs', phase)
      );
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(customManager['templatesDir'], 'phases', `${phase}.md`),
        path.join(customManager['targetDir'], '.ai-docs', phase, 'README.md')
      );
      expect(result).toBe(path.join(customManager['targetDir'], '.ai-docs', phase, 'README.md'));
    });
  });

  describe('copyFeatureDocTemplates', () => {
    it('copies configured phase templates to date-prefixed feature docs after preflighting targets', async () => {
      (mockFs.pathExists as any).mockReset();
      (mockFs.pathExists as any).mockImplementation(async (targetPath: string) =>
        targetPath.includes(path.join('templates', 'phases'))
      );
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.copy as any).mockResolvedValue(undefined);

      const result = await templateManager.copyFeatureDocTemplates('docs-init-feature-command', {
        date: '2026-05-25',
        phases: ['requirements', 'deployment']
      });

      expect(mockFs.pathExists).toHaveBeenCalledTimes(4);
      expect(mockFs.copy).toHaveBeenCalledTimes(2);
      expect(result).toEqual([
        {
          phase: 'requirements',
          path: path.join('/test/target', 'docs', 'ai', 'requirements', '2026-05-25-feature-docs-init-feature-command.md'),
          relativePath: path.join('docs', 'ai', 'requirements', '2026-05-25-feature-docs-init-feature-command.md')
        },
        {
          phase: 'deployment',
          path: path.join('/test/target', 'docs', 'ai', 'deployment', '2026-05-25-feature-docs-init-feature-command.md'),
          relativePath: path.join('docs', 'ai', 'deployment', '2026-05-25-feature-docs-init-feature-command.md')
        }
      ]);
      expect(mockFs.copy).toHaveBeenCalledWith(
        path.join(templateManager['templatesDir'], 'phases', 'requirements.md'),
        path.join('/test/target', 'docs', 'ai', 'requirements', '2026-05-25-feature-docs-init-feature-command.md')
      );
    });

    it('uses a custom docsDir when creating feature docs', async () => {
      const customManager = new TemplateManager({ targetDir: '/test/target', docsDir: '.ai-docs' });
      (mockFs.pathExists as any).mockReset();
      (mockFs.pathExists as any).mockImplementation(async (targetPath: string) =>
        targetPath.includes(path.join('templates', 'phases'))
      );
      (mockFs.ensureDir as any).mockResolvedValue(undefined);
      (mockFs.copy as any).mockResolvedValue(undefined);

      const result = await customManager.copyFeatureDocTemplates('sample', {
        date: '2026-05-25',
        phases: ['requirements']
      });

      expect(result[0].relativePath).toBe(path.join('.ai-docs', 'requirements', '2026-05-25-feature-sample.md'));
      expect(mockFs.ensureDir).toHaveBeenCalledWith(path.join('/test/target', '.ai-docs', 'requirements'));
    });

    it('fails before copying any files when target conflicts exist', async () => {
      (mockFs.pathExists as any).mockReset();
      (mockFs.copy as any).mockReset();
      (mockFs.pathExists as any).mockImplementation(async (targetPath: string) =>
        targetPath.includes(path.join('templates', 'phases')) ||
        targetPath.endsWith(path.join('requirements', '2026-05-25-feature-sample.md'))
      );

      await expect(
        templateManager.copyFeatureDocTemplates('sample', {
          date: '2026-05-25',
          phases: ['requirements', 'design']
        })
      ).rejects.toThrow('Feature docs already exist: docs/ai/requirements/2026-05-25-feature-sample.md');

      expect(mockFs.copy).not.toHaveBeenCalled();
    });

    it('fails before copying any files when a configured phase template is missing', async () => {
      (mockFs.pathExists as any).mockReset();
      (mockFs.copy as any).mockReset();
      (mockFs.pathExists as any).mockImplementation(async (targetPath: string) =>
        !targetPath.endsWith(path.join('templates', 'phases', 'deployment.md'))
      );

      await expect(
        templateManager.copyFeatureDocTemplates('sample', {
          date: '2026-05-25',
          phases: ['requirements', 'deployment']
        })
      ).rejects.toThrow('Phase templates not found: phases/deployment.md');

      expect(mockFs.copy).not.toHaveBeenCalled();
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

    it('should check custom docsDir path when provided', async () => {
      const customManager = new TemplateManager({ targetDir: '/test/target', docsDir: 'custom/docs' });
      const phase: Phase = 'testing';

      (mockFs.pathExists as any).mockResolvedValue(true);

      const result = await customManager.fileExists(phase);

      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(customManager['targetDir'], 'custom/docs', phase, 'README.md')
      );
      expect(result).toBe(true);
    });
  });

  describe('setupMultipleEnvironments', () => {
    it('should setup multiple environments successfully', async () => {
      const envCodes: EnvironmentCode[] = ['cursor', 'gemini'];
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
      const mockSetupSingleEnvironment = vi.fn();
      mockSetupSingleEnvironment
        .mockResolvedValueOnce(['/path/to/cursor/file1', '/path/to/cursor/file2'])
        .mockResolvedValueOnce(['/path/to/gemini/file1']);

      (templateManager as any).setupSingleEnvironment = mockSetupSingleEnvironment;

      const result = await templateManager.setupMultipleEnvironments(envCodes);

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
      const envCodes: EnvironmentCode[] = ['cursor', 'invalid' as any, 'gemini'];
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
        .mockReturnValueOnce(undefined) // invalid environment
        .mockReturnValueOnce(geminiEnv);

      const mockSetupSingleEnvironment = vi.fn();
      mockSetupSingleEnvironment
        .mockResolvedValueOnce(['/path/to/cursor/file1'])
        .mockResolvedValueOnce(['/path/to/gemini/file1']);

      (templateManager as any).setupSingleEnvironment = mockSetupSingleEnvironment;

      const result = await templateManager.setupMultipleEnvironments(envCodes);

      expect(mockUi.warning).toHaveBeenCalledWith("Environment 'invalid' not found, skipping");
      expect(result).toEqual([
        '/path/to/cursor/file1',
        '/path/to/gemini/file1'
      ]);
    });

    it('should throw error when setupSingleEnvironment fails', async () => {
      const envCodes: EnvironmentCode[] = ['cursor'];
      const cursorEnv = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(cursorEnv);

      const mockSetupSingleEnvironment = vi.fn().mockRejectedValue(new Error('Setup failed'));
      (templateManager as any).setupSingleEnvironment = mockSetupSingleEnvironment;

      await expect(templateManager.setupMultipleEnvironments(envCodes)).rejects.toThrow('Setup failed');

      expect(mockUi.error).toHaveBeenCalledWith("Error setting up environment 'Cursor': Setup failed");
    });
  });

  describe('checkEnvironmentExists', () => {
    it('should return false when environment does not exist', async () => {
      const envCode: EnvironmentCode = 'cursor';

      mockGetEnvironment.mockReturnValue(undefined);

      const result = await templateManager.checkEnvironmentExists(envCode);

      expect(mockGetEnvironment).toHaveBeenCalledWith(envCode);
      expect(result).toBe(false);
    });

    it('should return false when only context file exists', async () => {
      const envCode: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any).mockResolvedValueOnce(false); // command dir doesn't exist

      const result = await templateManager.checkEnvironmentExists(envCode);

      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], env.commandPath)
      );
      expect(result).toBe(false);
    });

    it('should return true when command directory exists', async () => {
      const envCode: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any).mockResolvedValueOnce(true); // command dir exists

      const result = await templateManager.checkEnvironmentExists(envCode);

      expect(result).toBe(true);
    });

    it('should return false when command directory does not exist', async () => {
      const envCode: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
        contextFileName: 'AGENTS.md',
        commandPath: '.cursor/commands',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any).mockResolvedValueOnce(false); // command dir doesn't exist

      const result = await templateManager.checkEnvironmentExists(envCode);

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
      homedir: vi.fn()
    };

    beforeEach(() => {
      vi.doMock('os', () => mockOs);
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
      (mockFs.readFile as any).mockResolvedValue('command content');
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const result = await templateManager.copyCommandsToGlobal('antigravity');

      expect(mockFs.ensureDir).toHaveBeenCalled();
      expect(mockFs.writeFile).toHaveBeenCalledTimes(2); // Only .md files
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
      (mockFs.readFile as any).mockResolvedValue('command content');
      (mockFs.writeFile as any).mockResolvedValue(undefined);

      const result = await templateManager.copyCommandsToGlobal('codex');

      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
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
