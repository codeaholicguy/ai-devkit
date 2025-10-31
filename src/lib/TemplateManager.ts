import * as fs from 'fs-extra';
import * as path from 'path';
import { Phase, EnvironmentCode, EnvironmentDefinition } from '../types';
import { getEnvironment } from '../util/env';

export class TemplateManager {
  private templatesDir: string;
  private targetDir: string;

  constructor(targetDir: string = process.cwd()) {
    this.templatesDir = path.join(__dirname, '../../templates');
    this.targetDir = targetDir;
  }

  async copyPhaseTemplate(phase: Phase): Promise<string> {
    const sourceFile = path.join(this.templatesDir, 'phases', `${phase}.md`);
    const targetDir = path.join(this.targetDir, 'docs', 'ai', phase);
    const targetFile = path.join(targetDir, 'README.md');

    await fs.ensureDir(targetDir);
    await fs.copy(sourceFile, targetFile);

    return targetFile;
  }


  async fileExists(phase: Phase): Promise<boolean> {
    const targetFile = path.join(this.targetDir, 'docs', 'ai', phase, 'README.md');
    return fs.pathExists(targetFile);
  }

  async setupMultipleEnvironments(environmentIds: EnvironmentCode[]): Promise<string[]> {
    const copiedFiles: string[] = [];

    for (const envId of environmentIds) {
      const env = getEnvironment(envId);
      if (!env) {
        console.warn(`Warning: Environment '${envId}' not found, skipping`);
        continue;
      }

      try {
        const envFiles = await this.setupSingleEnvironment(env);
        copiedFiles.push(...envFiles);
      } catch (error) {
        console.error(`Error setting up environment '${env.name}':`, error);
        throw error; // Re-throw to stop the entire process on failure
      }
    }

    return copiedFiles;
  }

  async checkEnvironmentExists(envId: EnvironmentCode): Promise<boolean> {
    const env = getEnvironment(envId);

    if (!env) {
      return false;
    }

    const contextFilePath = path.join(this.targetDir, env.contextFileName);
    const contextFileExists = await fs.pathExists(contextFilePath);

    const commandDirPath = path.join(this.targetDir, env.commandPath);
    const commandDirExists = await fs.pathExists(commandDirPath);

    return contextFileExists || commandDirExists;
  }

  private async setupSingleEnvironment(env: EnvironmentDefinition): Promise<string[]> {
    const copiedFiles: string[] = [];

    try {
      const contextSource = path.join(this.templatesDir, 'env', env.code, env.contextFileName);
      const contextTarget = path.join(this.targetDir, env.contextFileName);

      if (await fs.pathExists(contextSource)) {
        await fs.copy(contextSource, contextTarget);
        copiedFiles.push(contextTarget);
      } else {
        console.warn(`Warning: Context file not found: ${contextSource}`);
      }

      const commandsSourceDir = path.join(this.templatesDir, 'commands');
      const commandsTargetDir = path.join(this.targetDir, env.commandPath);

      if (await fs.pathExists(commandsSourceDir)) {
        await fs.ensureDir(commandsTargetDir);
        await fs.copy(commandsSourceDir, commandsTargetDir);

        const commandFiles = await fs.readdir(commandsTargetDir);
        commandFiles.forEach(file => {
          copiedFiles.push(path.join(commandsTargetDir, file));
        });
      } else {
        console.warn(`Warning: Commands directory not found: ${commandsSourceDir}`);
      }

      if (env.code === 'cursor') {
        await this.copyCursorSpecificFiles(copiedFiles);
      }

    } catch (error) {
      console.error(`Error setting up environment ${env.name}:`, error);
      throw error;
    }

    return copiedFiles;
  }

  private async copyCursorSpecificFiles(copiedFiles: string[]): Promise<void> {
    const rulesSourceDir = path.join(this.templatesDir, 'env', 'cursor', 'rules');
    const rulesTargetDir = path.join(this.targetDir, '.cursor', 'rules');

    if (await fs.pathExists(rulesSourceDir)) {
      await fs.ensureDir(rulesTargetDir);
      await fs.copy(rulesSourceDir, rulesTargetDir);

      const ruleFiles = await fs.readdir(rulesSourceDir);
      ruleFiles.forEach(file => {
        copiedFiles.push(path.join(rulesTargetDir, file));
      });
    }
  }
}

