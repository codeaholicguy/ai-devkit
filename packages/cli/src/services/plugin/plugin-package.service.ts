import { execFile } from 'child_process';
import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { promisify } from 'util';
import { ValidationError } from '../../util/errors.js';
import { getErrorMessage } from '../../util/text.js';

const execFileAsync = promisify(execFile);
const NPM_PACKAGE_NAME_PATTERN = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/i;

export interface NpmRunOptions {
  cwd: string;
}

export type NpmRunner = (args: string[], options: NpmRunOptions) => Promise<void>;

export interface PluginPackageService {
  ensureGlobalNpmProject(): Promise<void>;
  install(pluginName: string): Promise<void>;
  uninstall(pluginName: string): Promise<void>;
}

interface PluginPackageServiceDeps {
  runNpm?: NpmRunner;
}

export function getGlobalPluginNpmRoot(): string {
  return path.join(os.homedir(), '.ai-devkit', 'npm');
}

export function createPluginPackageService(deps: PluginPackageServiceDeps = {}): PluginPackageService {
  const runNpm = deps.runNpm ?? defaultRunNpm;

  return {
    async ensureGlobalNpmProject(): Promise<void> {
      const npmRoot = getGlobalPluginNpmRoot();
      const packageJsonPath = path.join(npmRoot, 'package.json');

      await fs.ensureDir(npmRoot);

      if (await fs.pathExists(packageJsonPath)) {
        return;
      }

      await fs.writeJson(packageJsonPath, {
        private: true,
        type: 'module',
        dependencies: {}
      }, { spaces: 2 });
    },

    async install(pluginName: string): Promise<void> {
      const normalizedName = validatePluginPackageName(pluginName);
      await this.ensureGlobalNpmProject();
      try {
        await runNpm(['install', normalizedName], { cwd: getGlobalPluginNpmRoot() });
      } catch (error) {
        throw new Error(`Failed to install plugin package ${normalizedName}: ${getErrorMessage(error)}`);
      }
    },

    async uninstall(pluginName: string): Promise<void> {
      const normalizedName = validatePluginPackageName(pluginName);
      await this.ensureGlobalNpmProject();
      try {
        await runNpm(['uninstall', normalizedName], { cwd: getGlobalPluginNpmRoot() });
      } catch (error) {
        throw new Error(`Failed to uninstall plugin package ${normalizedName}: ${getErrorMessage(error)}`);
      }
    }
  };
}

export function validatePluginPackageName(pluginName: string): string {
  const normalizedName = pluginName.trim();

  if (!normalizedName) {
    throw new ValidationError('Plugin package name must be a non-empty npm package name.');
  }

  if (
    normalizedName.startsWith('.')
    || normalizedName.startsWith('/')
    || normalizedName.includes('\\')
    || !NPM_PACKAGE_NAME_PATTERN.test(normalizedName)
  ) {
    throw new ValidationError('Only npm package names are supported for plugins.');
  }

  return normalizedName;
}

async function defaultRunNpm(args: string[], options: NpmRunOptions): Promise<void> {
  await execFileAsync('npm', args, {
    cwd: options.cwd
  });
}
