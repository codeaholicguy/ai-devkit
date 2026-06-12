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
    it('should not copy workflow command templates', async () => {
      const env: EnvironmentDefinition = {
        code: 'test-env',
        name: 'Test Environment',
      };

      const result = await (templateManager as any).setupSingleEnvironment(env);

      expect(mockFs.ensureDir).not.toHaveBeenCalled();
      expect(mockFs.copy).not.toHaveBeenCalled();
      expect(mockFs.writeFile).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should handle cursor environment with special files', async () => {
      const env: EnvironmentDefinition = {
        code: 'cursor',
        name: 'Cursor',
      };

      const mockRuleFiles = ['rule1.md', 'rule2.toml'];

      (mockFs.pathExists as any).mockResolvedValueOnce(true);

      (mockFs.readdir as any).mockResolvedValueOnce(mockRuleFiles);
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

    it('should handle errors and rethrow them', async () => {
      const env: EnvironmentDefinition = {
        code: 'cursor',
        name: 'Cursor',
      };

      (mockFs.pathExists as any).mockResolvedValueOnce(true);
      (mockFs.readdir as any).mockRejectedValue(new Error('Test error'));

      await expect((templateManager as any).setupSingleEnvironment(env)).rejects.toThrow('Test error');

      expect(mockUi.error).toHaveBeenCalledWith(
        "Error setting up environment 'Cursor': Test error"
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
      };
      const geminiEnv = {
        code: 'gemini',
        name: 'Gemini',
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
      };
      const geminiEnv = {
        code: 'gemini',
        name: 'Gemini',
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

    it('should check Cursor rules instead of workflow command directories', async () => {
      const envCode: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any).mockResolvedValueOnce(false);

      const result = await templateManager.checkEnvironmentExists(envCode);

      expect(mockFs.pathExists).toHaveBeenCalledWith(
        path.join(templateManager['targetDir'], '.cursor', 'rules')
      );
      expect(result).toBe(false);
    });

    it('should return true when Cursor rules exist', async () => {
      const envCode: EnvironmentCode = 'cursor';
      const env = {
        code: 'cursor',
        name: 'Cursor',
      };

      mockGetEnvironment.mockReturnValue(env);

      (mockFs.pathExists as any).mockResolvedValueOnce(true);

      const result = await templateManager.checkEnvironmentExists(envCode);

      expect(result).toBe(true);
    });

    it('should return false for environments with no generated non-command files', async () => {
      const envCode: EnvironmentCode = 'codex';
      const env = {
        code: 'codex',
        name: 'OpenAI Codex',
      };

      mockGetEnvironment.mockReturnValue(env);

      const result = await templateManager.checkEnvironmentExists(envCode);

      expect(mockFs.pathExists).not.toHaveBeenCalled();
      expect(result).toBe(false);
    });
  });
});
