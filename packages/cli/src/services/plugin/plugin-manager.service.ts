import { NotFoundError } from "../../util/errors.js";
import { GlobalConfigManager } from "../../lib/GlobalConfig.js";
import { getErrorMessage } from "../../util/text.js";
import {
  createPluginPackageService,
  type PluginPackageService,
  validatePluginPackageName,
} from "./plugin-package.service.js";
import { validateInstalledPluginManifest } from "./plugin-loader.service.js";

export interface PluginListItem {
  name: string;
  status: "valid" | "invalid";
  error?: string;
}

export interface PluginUpdateResult {
  name: string;
  status: "updated" | "up-to-date" | "failed";
  fromVersion?: string;
  targetVersion?: string;
  toVersion?: string;
  error?: string;
}

interface PluginConfigStore {
  addPlugin(pluginName: string): Promise<unknown>;
  removePlugin(pluginName: string): Promise<unknown>;
  getPlugins(): Promise<string[]>;
}

interface PluginManagerDeps {
  packages?: PluginPackageService;
  config?: PluginConfigStore;
  validateInstalledPlugin?: (pluginName: string) => Promise<void>;
}

export function createPluginManager(deps: PluginManagerDeps = {}) {
  const packages = deps.packages ?? createPluginPackageService();
  const config = deps.config ?? new GlobalConfigManager();
  const validateInstalledPlugin = deps.validateInstalledPlugin ?? validateInstalledPluginManifest;

  return {
    async add(pluginName: string): Promise<void> {
      const normalizedName = validatePluginPackageName(pluginName);

      await packages.install(normalizedName);

      try {
        await validateInstalledPlugin(normalizedName);
      } catch (error) {
        await rollbackInstall(packages, normalizedName, error);
      }

      await config.addPlugin(normalizedName);
    },

    async update(pluginName?: string): Promise<PluginUpdateResult[]> {
      const target = pluginName === undefined ? undefined : validatePluginPackageName(pluginName);
      const configured = await config.getPlugins();
      if (target !== undefined && !configured.includes(target)) {
        throw new NotFoundError(`Plugin "${target}" is not configured. Use plugin add first.`);
      }
      const results: PluginUpdateResult[] = [];
      for (const name of target === undefined ? configured : [target]) {
        const result: PluginUpdateResult = { name, status: "failed" };
        try {
          result.fromVersion = await packages.getInstalledVersion(name);
          result.targetVersion = await packages.getLatestVersion(name);
          if (result.fromVersion === result.targetVersion) {
            result.toVersion = result.fromVersion;
            result.status = "up-to-date";
          } else {
            await packages.installLatest(name);
            result.toVersion = await packages.getInstalledVersion(name);
            await validateInstalledPlugin(name);
            result.status = "updated";
          }
        } catch (error) {
          result.error = getErrorMessage(error);
        }
        results.push(result);
      }
      return results;
    },

    async remove(pluginName: string): Promise<void> {
      const normalizedName = validatePluginPackageName(pluginName);

      await packages.uninstall(normalizedName);
      await config.removePlugin(normalizedName);
    },

    async list(): Promise<PluginListItem[]> {
      const plugins = await config.getPlugins();
      const items: PluginListItem[] = [];

      for (const plugin of plugins) {
        try {
          await validateInstalledPlugin(plugin);
          items.push({
            name: plugin,
            status: "valid",
            error: undefined,
          });
        } catch (error) {
          items.push({
            name: plugin,
            status: "invalid",
            error: getErrorMessage(error),
          });
        }
      }

      return items;
    },
  };
}

async function rollbackInstall(
  packages: PluginPackageService,
  pluginName: string,
  validationError: unknown,
): Promise<never> {
  try {
    await packages.uninstall(pluginName);
  } catch (rollbackError) {
    throw new Error(
      `${getErrorMessage(validationError)} Rollback uninstall also failed: ${getErrorMessage(rollbackError)}`,
    );
  }

  throw validationError;
}
