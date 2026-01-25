import { exec } from 'child_process';
import { ensureGitInstalled, cloneRepository } from '../../util/git';

jest.mock('child_process');
jest.mock('fs-extra');

const mockedExec = exec as jest.MockedFunction<typeof exec>;

import * as fs from 'fs-extra';
const mockedFs = fs as jest.Mocked<typeof fs>;

describe('Git Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ensureGitInstalled', () => {
    it('should not throw when git is installed', async () => {
      mockedExec.mockImplementation((command: string, callback?: any) => {
        if (callback) {
          callback(null, { stdout: 'git version 2.39.0', stderr: '' });
        }
        return {} as any;
      });

      await expect(ensureGitInstalled()).resolves.not.toThrow();
    });

    it('should throw error when git is not installed', async () => {
      mockedExec.mockImplementation((command: string, callback?: any) => {
        if (callback) {
          callback(new Error('command not found: git'), { stdout: '', stderr: 'command not found: git' });
        }
        return {} as any;
      });

      await expect(ensureGitInstalled()).rejects.toThrow(
        'Git is not installed or not in PATH. Please install Git: https://git-scm.com/downloads'
      );
    });

    it('should throw error when git command fails', async () => {
      mockedExec.mockImplementation((command: string, callback?: any) => {
        if (callback) {
          callback(new Error('Exec failed'), { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await expect(ensureGitInstalled()).rejects.toThrow();
    });

    it('should call git --version command', async () => {
      mockedExec.mockImplementation((command: string, callback?: any) => {
        expect(command).toBe('git --version');
        if (callback) {
          callback(null, { stdout: 'git version 2.39.0', stderr: '' });
        }
        return {} as any;
      });

      await ensureGitInstalled();
      expect(mockedExec).toHaveBeenCalled();
      const firstCall = mockedExec.mock.calls[0][0];
      expect(firstCall).toBe('git --version');
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
      expect(mockedExec).not.toHaveBeenCalled();
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('already exists, skipped')
      );
    });

    it('should clone repository when it does not exist', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        if (callback) {
          callback(null, { stdout: 'Cloning...', stderr: '' });
        }
        return {} as any;
      });

      const result = await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(result).toBe(`${mockTargetDir}/${mockRepoName}`);
      expect(mockedFs.pathExists).toHaveBeenCalledWith(`${mockTargetDir}/${mockRepoName}`);
      expect(mockedFs.ensureDir).toHaveBeenCalled();
      expect(mockedExec).toHaveBeenCalled();
    });

    it('should use correct git clone command with flags', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        expect(command).toContain('git clone');
        expect(command).toContain('--depth 1');
        expect(command).toContain('--single-branch');
        expect(command).toContain(mockGitUrl);
        expect(command).toContain(`"${mockTargetDir}/${mockRepoName}"`);
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);
    });

    it('should have 60 second timeout for git clone', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        expect(options.timeout).toBe(60000);
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);
    });

    it('should log progress messages', async () => {
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
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
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        if (callback) {
          callback(new Error('Network error'), { stdout: '', stderr: '' });
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
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        if (callback) {
          callback(new Error('Timeout'), { stdout: '', stderr: '' });
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
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, mockGitUrl);

      expect(mockedFs.ensureDir).toHaveBeenCalled();
      const ensureDirCallOrder = mockedFs.ensureDir.mock.invocationCallOrder[0];
      const execCallOrder = mockedExec.mock.invocationCallOrder[0];
      expect(ensureDirCallOrder).toBeLessThan(execCallOrder);
    });

    it('should handle URLs with special characters correctly', async () => {
      const specialUrl = 'https://github.com/org-name/repo-name_2.git';
      mockedFs.pathExists.mockResolvedValue(false as never);
      mockedFs.ensureDir.mockResolvedValue(undefined as never);
      mockedExec.mockImplementation((command: string, options: any, callback?: any) => {
        expect(command).toContain(`"${specialUrl}"`);
        if (callback) {
          callback(null, { stdout: '', stderr: '' });
        }
        return {} as any;
      });

      await cloneRepository(mockTargetDir, mockRepoName, specialUrl);
    });
  });
});
