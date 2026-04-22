import { execFile } from 'child_process';
import { ensureGitInstalled, cloneRepository, isGitRepository, pullRepository } from '../../util/git';

jest.mock('child_process');
jest.mock('fs-extra');

const mockedExecFile = execFile as jest.MockedFunction<typeof execFile>;

import * as fs from 'fs-extra';
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Git Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => { });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ensureGitInstalled', () => {
    it('should not throw when git is installed', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, callback?: any) => {
        const cb = typeof args === 'function' ? args : callback;
        if (cb) {
          cb(null, 'git version 2.39.0', '');
        }
        return {} as any;
      });

      await expect(ensureGitInstalled()).resolves.not.toThrow();
    });

    it('should throw error when git is not installed', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, callback?: any) => {
        const cb = typeof args === 'function' ? args : callback;
        if (cb) {
          cb(new Error('command not found: git'), '', '');
        }
        return {} as any;
      });

      await expect(ensureGitInstalled()).rejects.toThrow(
        'Git is not installed or not in PATH. Please install Git: https://git-scm.com/downloads'
      );
    });

    it('should throw error when git command fails', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, callback?: any) => {
        const cb = typeof args === 'function' ? args : callback;
        if (cb) {
          cb(new Error('Exec failed'), '', '');
        }
        return {} as any;
      });

      await expect(ensureGitInstalled()).rejects.toThrow();
    });

    it('should call git with --version argument', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, callback?: any) => {
        const cb = typeof args === 'function' ? args : callback;
        if (cb) {
          cb(null, 'git version 2.39.0', '');
        }
        return {} as any;
      });

      await ensureGitInstalled();
      expect(mockedExecFile).toHaveBeenCalled();
      expect(mockedExecFile.mock.calls[0][0]).toBe('git');
      expect(mockedExecFile.mock.calls[0][1]).toEqual(['--version']);
    });
  });

  describe('cloneRepository', () => {
    const mockTargetDir = '/home/user/.ai-devkit/skills';
    const mockRepoName = 'anthropics/skills';
    const mockGitUrl = 'https://github.com/anthropics/skills.git';

    it('should skip cloning if repository already exists', async () => {
      (mockedFs.pathExists as any).mockResolvedValue(true);

      const result = await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(result).toBe(`${mockTargetDir}/${mockRepoName}`);
      expect(mockedFs.pathExists).toHaveBeenCalledWith(`${mockTargetDir}/${mockRepoName}`);
      expect(mockedExecFile).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('already exists, skipped')
      );
    });

    it('should clone repository when it does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, 'Cloning...', '');
        }
        return {} as any;
      });

      const result = await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(result).toBe(`${mockTargetDir}/${mockRepoName}`);
      expect(mockedFs.pathExists).toHaveBeenCalledWith(`${mockTargetDir}/${mockRepoName}`);
      expect(mockedFs.ensureDir).toHaveBeenCalled();
      expect(mockedExecFile).toHaveBeenCalled();
    });

    it('should use correct git clone arguments', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(mockedExecFile.mock.calls[0][0]).toBe('git');
      expect(mockedExecFile.mock.calls[0][1]).toEqual([
        'clone', '--depth', '1', '--single-branch',
        mockGitUrl,
        `${mockTargetDir}/${mockRepoName}`,
      ]);
    });

    it('should have 60 second timeout for git clone', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(mockedExecFile.mock.calls[0][2]).toEqual(
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('should log progress messages', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Cloning')
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('Clone complete')
      );
    });

    it('should throw error when git clone fails', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error('Network error'), '', '');
        }
        return {} as any;
      });

      await expect(
        cloneRepository(mockTargetDir, mockRepoName, mockGitUrl)
      ).rejects.toThrow('Git clone failed: Network error. Check network and git installation.');
    });

    it('should throw error when git clone times out', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error('Timeout'), '', '');
        }
        return {} as any;
      });

      await expect(
        cloneRepository(mockTargetDir, mockRepoName, mockGitUrl)
      ).rejects.toThrow('Git clone failed');
    });

    it('should ensure parent directory exists before cloning', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(mockedFs.ensureDir).toHaveBeenCalled();
      const ensureDirCallOrder = mockedFs.ensureDir.mock.invocationCallOrder[0];
      const execCallOrder = mockedExecFile.mock.invocationCallOrder[0];
      expect(ensureDirCallOrder).toBeLessThan(execCallOrder);
    });

    it('should handle URLs with special characters correctly', async () => {
      const specialUrl = 'https://github.com/org-name/repo-name_2.git';
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, specialUrl);

      expect(mockedExecFile.mock.calls[0][1]).toContain(specialUrl);
    });
  });

  describe('isGitRepository', () => {
    it('should return true when .git directory exists', async () => {
      mockedFs.pathExists.mockResolvedValue(true as never);

      const result = await isGitRepository('/path/to/repo');

      expect(result).toBe(true);
      expect(mockedFs.pathExists).toHaveBeenCalledWith('/path/to/repo/.git');
    });

    it('should return false when .git directory does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);

      const result = await isGitRepository('/path/to/non-git');

      expect(result).toBe(false);
      expect(mockedFs.pathExists).toHaveBeenCalledWith('/path/to/non-git/.git');
    });

    it('should handle paths with trailing slashes', async () => {
      mockedFs.pathExists.mockResolvedValue(true as never);

      const result = await isGitRepository('/path/to/repo/');

      expect(result).toBe(true);
      expect(mockedFs.pathExists).toHaveBeenCalled();
    });

    it('should work with relative paths', async () => {
      mockedFs.pathExists.mockResolvedValue(true as never);

      const result = await isGitRepository('./repo');

      expect(result).toBe(true);
      expect(mockedFs.pathExists).toHaveBeenCalledWith('repo/.git');
    });
  });

  describe('pullRepository', () => {
    const mockRepoPath = '/home/user/.ai-devkit/skills/anthropic/skills';

    it('should successfully pull repository', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, 'Already up to date.', '');
        }
        return {} as any;
      });

      await expect(pullRepository(mockRepoPath)).resolves.not.toThrow();
      expect(mockedExecFile).toHaveBeenCalled();
    });

    it('should use correct git pull arguments', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await pullRepository(mockRepoPath);

      expect(mockedExecFile.mock.calls[0][0]).toBe('git');
      expect(mockedExecFile.mock.calls[0][1]).toEqual(['pull']);
    });

    it('should set cwd to repository path', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await pullRepository(mockRepoPath);

      expect(mockedExecFile.mock.calls[0][2]).toEqual(
        expect.objectContaining({ cwd: mockRepoPath })
      );
    });

    it('should have 60 second timeout for git pull', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(null, '', '');
        }
        return {} as any;
      });

      await pullRepository(mockRepoPath);

      expect(mockedExecFile.mock.calls[0][2]).toEqual(
        expect.objectContaining({ timeout: 60000 })
      );
    });

    it('should throw error when git pull fails', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error('You have unstaged changes'), '', '');
        }
        return {} as any;
      });

      await expect(pullRepository(mockRepoPath)).rejects.toThrow(
        'Git pull failed: You have unstaged changes'
      );
    });

    it('should throw error on network failure', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error('Network unreachable'), '', '');
        }
        return {} as any;
      });

      await expect(pullRepository(mockRepoPath)).rejects.toThrow(
        'Git pull failed: Network unreachable'
      );
    });

    it('should throw error on timeout', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error('Command timeout'), '', '');
        }
        return {} as any;
      });

      await expect(pullRepository(mockRepoPath)).rejects.toThrow(
        'Git pull failed: Command timeout'
      );
    });

    it('should handle merge conflicts error', async () => {
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error('CONFLICT: Merge conflict in file.txt'), '', '');
        }
        return {} as any;
      });

      await expect(pullRepository(mockRepoPath)).rejects.toThrow(
        'Git pull failed: CONFLICT: Merge conflict in file.txt'
      );
    });

    it('should preserve error message from git', async () => {
      const gitError = 'fatal: unable to access repository';
      mockedExecFile.mockImplementation((file: string, args: any, options: any, callback?: any) => {
        const cb = typeof options === 'function' ? options : callback;
        if (cb) {
          cb(new Error(gitError), '', '');
        }
        return {} as any;
      });

      await expect(pullRepository(mockRepoPath)).rejects.toThrow(
        `Git pull failed: ${gitError}`
      );
    });
  });
});
