import {
  AI_DEVKIT_GITIGNORE_END,
  AI_DEVKIT_GITIGNORE_START,
  buildManagedGitignoreBody,
  collectInitCommandPathIgnorePatterns,
  commandPathToGitignoreDirPattern,
  mergeAiDevkitGitignoreBlock,
  normalizeDocsDirForIgnore,
  writeGitignoreWithAiDevkitBlock
} from '../../lib/gitignoreArtifacts';
import * as fs from 'fs-extra';
import * as path from 'path';

jest.mock('fs-extra');

describe('gitignoreArtifacts', () => {
  describe('normalizeDocsDirForIgnore', () => {
    it('trims and normalizes slashes', () => {
      expect(normalizeDocsDirForIgnore('  docs/ai  ')).toBe('docs/ai');
      expect(normalizeDocsDirForIgnore('docs\\ai')).toBe('docs/ai');
    });

    it('strips leading ./', () => {
      expect(normalizeDocsDirForIgnore('./docs/ai')).toBe('docs/ai');
    });

    it('rejects empty, absolute, .., and empty segments', () => {
      expect(() => normalizeDocsDirForIgnore('')).toThrow();
      expect(() => normalizeDocsDirForIgnore('  ')).toThrow();
      expect(() => normalizeDocsDirForIgnore('/abs')).toThrow();
      expect(() => normalizeDocsDirForIgnore('docs/../x')).toThrow();
      expect(() => normalizeDocsDirForIgnore('docs//ai')).toThrow();
    });
  });

  describe('commandPathToGitignoreDirPattern', () => {
    it('normalizes to a directory line with trailing slash', () => {
      expect(commandPathToGitignoreDirPattern('.cursor/commands')).toBe('.cursor/commands/');
      expect(commandPathToGitignoreDirPattern('./.opencode/commands')).toBe('.opencode/commands/');
    });

    it('returns null for unsafe paths', () => {
      expect(commandPathToGitignoreDirPattern('')).toBeNull();
      expect(commandPathToGitignoreDirPattern('docs/../x')).toBeNull();
      expect(commandPathToGitignoreDirPattern('/abs/path')).toBeNull();
    });
  });

  describe('collectInitCommandPathIgnorePatterns', () => {
    it('matches every environment commandPath and excludes skills / global paths', () => {
      const patterns = collectInitCommandPathIgnorePatterns();
      expect(patterns).toEqual([
        '.agent/workflows/',
        '.agents/commands/',
        '.claude/commands/',
        '.codex/commands/',
        '.cursor/commands/',
        '.gemini/commands/',
        '.github/prompts/',
        '.kilocode/commands/',
        '.opencode/commands/',
        '.roo/commands/',
        '.windsurf/commands/'
      ]);
      expect(patterns).not.toContain('.cursor/skills/');
      expect(patterns).not.toContain('.opencode/skills/');
      expect(patterns).not.toContain('.gemini/antigravity/');
      expect(patterns).not.toContain('.codex/prompts/');
    });
  });

  describe('buildManagedGitignoreBody', () => {
    it('includes config file, docs dir, and command directories only', () => {
      const body = buildManagedGitignoreBody('docs/ai');
      expect(body).toMatch(/^\.ai-devkit\.json\ndocs\/ai\/\n/);
      expect(body).toContain('.cursor/commands/');
      expect(body).toContain('.opencode/commands/');
      expect(body).not.toContain('.cursor/skills');
    });
  });

  describe('mergeAiDevkitGitignoreBlock', () => {
    const blockForDocsAi = `${AI_DEVKIT_GITIGNORE_START}\n${buildManagedGitignoreBody('docs/ai')}${AI_DEVKIT_GITIGNORE_END}\n`;

    it('creates block only when file empty', () => {
      expect(mergeAiDevkitGitignoreBlock('', 'docs/ai')).toBe(blockForDocsAi);
    });

    it('appends block after existing user content', () => {
      const user = 'node_modules/\n';
      expect(mergeAiDevkitGitignoreBlock(user, 'docs/ai')).toBe(`node_modules/\n\n${blockForDocsAi}`);
    });

    it('replaces managed block when docs path changes', () => {
      const before = `keep-me\n\n${AI_DEVKIT_GITIGNORE_START}\n.ai-devkit.json\nold/\n${AI_DEVKIT_GITIGNORE_END}\n\ntrailer\n`;
      const merged = mergeAiDevkitGitignoreBlock(before, 'docs/custom');
      expect(merged).toContain('keep-me');
      expect(merged).toContain('trailer');
      expect(merged).toContain('docs/custom/');
      expect(merged).not.toContain('old/');
    });

    it('is idempotent when content unchanged', () => {
      const once = mergeAiDevkitGitignoreBlock('', 'docs/ai');
      const twice = mergeAiDevkitGitignoreBlock(once, 'docs/ai');
      expect(twice).toBe(once);
    });

    it('repairs missing end marker by replacing from start', () => {
      const broken = `${AI_DEVKIT_GITIGNORE_START}\n.ai-devkit.json\ndocs/ai/\n`;
      const merged = mergeAiDevkitGitignoreBlock(broken, 'docs/ai');
      expect(merged).toContain(AI_DEVKIT_GITIGNORE_END);
      expect(merged.split(AI_DEVKIT_GITIGNORE_START).length - 1).toBe(1);
    });

    it('preserves content outside the managed block', () => {
      const content = `# top\n\n${blockForDocsAi}# bottom\n`;
      const merged = mergeAiDevkitGitignoreBlock(content, 'docs/ai');
      expect(merged).toContain('# top');
      expect(merged).toContain('# bottom');
    });
  });

  describe('writeGitignoreWithAiDevkitBlock', () => {
    const mockFs = fs as jest.Mocked<typeof fs>;

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('writes merged content when file missing', async () => {
      mockFs.pathExists.mockResolvedValue(false as never);
      mockFs.writeFile.mockResolvedValue(undefined as never);

      await writeGitignoreWithAiDevkitBlock('/repo', 'docs/ai');

      expect(mockFs.pathExists).toHaveBeenCalledWith(path.join('/repo', '.gitignore'));
      expect(mockFs.writeFile).toHaveBeenCalledTimes(1);
      const written = mockFs.writeFile.mock.calls[0][1] as string;
      expect(written).toContain('.ai-devkit.json');
      expect(written).toContain('docs/ai/');
    });

    it('skips write when merge is identical', async () => {
      const body = buildManagedGitignoreBody('docs/ai');
      const unchanged = `${AI_DEVKIT_GITIGNORE_START}\n${body}${AI_DEVKIT_GITIGNORE_END}\n`;
      mockFs.pathExists.mockResolvedValue(true as never);
      mockFs.readFile.mockResolvedValue(unchanged as never);

      await writeGitignoreWithAiDevkitBlock('/tmp', 'docs/ai');

      expect(mockFs.writeFile).not.toHaveBeenCalled();
    });
  });
});
