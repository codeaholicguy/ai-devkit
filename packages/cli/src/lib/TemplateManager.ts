import fs from "fs-extra";
import * as path from "path";
import * as os from "os";
import { fileURLToPath } from "url";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { Phase, EnvironmentCode, EnvironmentDefinition, DEFAULT_DOCS_DIR } from "../types.js";
import { ui } from "../util/terminal-ui.js";
import { getEnvironment } from "../util/env.js";

export interface TemplateManagerOptions {
  targetDir?: string;
  docsDir?: string;
}

export interface FeatureDocTemplateOptions {
  date: string;
  phases: Phase[];
  docsDir?: string;
}

export interface FeatureDoc {
  phase: Phase;
  path: string;
  relativePath: string;
}

export class TemplateManager {
  private templatesDir: string;
  private targetDir: string;
  private docsDir: string;

  constructor(options: TemplateManagerOptions = {}) {
    this.templatesDir = path.join(__dirname, "../../templates");
    this.targetDir = options.targetDir ?? process.cwd();
    this.docsDir = options.docsDir ?? DEFAULT_DOCS_DIR;
  }

  async copyPhaseTemplate(phase: Phase): Promise<string> {
    const sourceFile = path.join(this.templatesDir, "phases", `${phase}.md`);
    const targetDir = path.join(this.targetDir, this.docsDir, phase);
    const targetFile = path.join(targetDir, "README.md");

    await fs.ensureDir(targetDir);
    await fs.copy(sourceFile, targetFile);

    return targetFile;
  }

  async copyFeatureDocTemplates(
    featureName: string,
    options: FeatureDocTemplateOptions
  ): Promise<FeatureDoc[]> {
    const docsDir = options.docsDir ?? this.docsDir;
    const docs = options.phases.map((phase) => {
      const fileName = `${options.date}-feature-${featureName}.md`;
      const relativePath = path.join(docsDir, phase, fileName);

      return {
        phase,
        sourceFile: path.join(this.templatesDir, "phases", `${phase}.md`),
        targetDir: path.join(this.targetDir, docsDir, phase),
        targetFile: path.join(this.targetDir, relativePath),
        relativePath
      };
    });

    const missingTemplates: string[] = [];
    for (const doc of docs) {
      if (!await fs.pathExists(doc.sourceFile)) {
        missingTemplates.push(path.join("phases", `${doc.phase}.md`));
      }
    }

    if (missingTemplates.length > 0) {
      throw new Error(`Phase templates not found: ${missingTemplates.join(', ')}`);
    }

    const existingFiles: string[] = [];
    for (const doc of docs) {
      if (await fs.pathExists(doc.targetFile)) {
        existingFiles.push(doc.relativePath);
      }
    }

    if (existingFiles.length > 0) {
      throw new Error(`Feature docs already exist: ${existingFiles.join(', ')}`);
    }

    const created: FeatureDoc[] = [];
    for (const doc of docs) {
      await fs.ensureDir(doc.targetDir);
      await fs.copy(doc.sourceFile, doc.targetFile);
      created.push({
        phase: doc.phase,
        path: doc.targetFile,
        relativePath: doc.relativePath
      });
    }

    return created;
  }

  async fileExists(phase: Phase): Promise<boolean> {
    const targetFile = path.join(
      this.targetDir,
      this.docsDir,
      phase,
      "README.md"
    );
    return fs.pathExists(targetFile);
  }

  async setupMultipleEnvironments(
    environmentCodes: EnvironmentCode[]
  ): Promise<string[]> {
    const copiedFiles: string[] = [];

    for (const envCode of environmentCodes) {
      const env = getEnvironment(envCode);
      if (!env) {
        ui.warning(`Environment '${envCode}' not found, skipping`);
        continue;
      }

      try {
        const envFiles = await this.setupSingleEnvironment(env);
        copiedFiles.push(...envFiles);
      } catch (error) {
        ui.error(`Error setting up environment '${env.name}': ${error instanceof Error ? error.message : String(error)}`);
        throw error; // Re-throw to stop the entire process on failure
      }
    }

    return copiedFiles;
  }

  async checkEnvironmentExists(envCode: EnvironmentCode): Promise<boolean> {
    const env = getEnvironment(envCode);

    if (!env) {
      return false;
    }

    const commandDirPath = path.join(this.targetDir, env.commandPath);
    const commandDirExists = await fs.pathExists(commandDirPath);

    return commandDirExists;
  }

  private async setupSingleEnvironment(
    env: EnvironmentDefinition
  ): Promise<string[]> {
    const copiedFiles: string[] = [];

    try {
      if (!env.isCustomCommandPath) {
        await this.copyCommands(env, copiedFiles);
      }

      switch (env.code) {
        case "cursor":
          await this.copyCursorSpecificFiles(copiedFiles);
          break;
        case "gemini":
          await this.copyGeminiSpecificFiles(copiedFiles);
          break;
        default:
          break;
      }
    } catch (error) {
      ui.error(`Error setting up environment '${env.name}': ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }

    return copiedFiles;
  }

  private async copyCommands(
    env: EnvironmentDefinition,
    copiedFiles: string[]
  ): Promise<void> {
    const commandsSourceDir = path.join(this.templatesDir, "commands");
    const commandExtension = env.customCommandExtension || ".md";
    const commandsTargetDir = path.join(this.targetDir, env.commandPath);

    if (await fs.pathExists(commandsSourceDir)) {
      await fs.ensureDir(commandsTargetDir);

      const commandFiles = await fs.readdir(commandsSourceDir);
      await Promise.all(
        commandFiles
          .filter((file: string) => file.endsWith(".md"))
          .map(async (file: string) => {
            const targetFile = file.replace('.md', commandExtension);
            const content = await fs.readFile(
              path.join(commandsSourceDir, file),
              "utf-8"
            );
            const replaced = this.replaceDocsDir(content);
            await fs.writeFile(
              path.join(commandsTargetDir, targetFile),
              replaced
            );
            copiedFiles.push(path.join(commandsTargetDir, targetFile));
          })
      );
    } else {
      ui.warning(`Commands directory not found: ${commandsSourceDir}`);
    }
  }

  private async copyCursorSpecificFiles(copiedFiles: string[]): Promise<void> {
    const rulesSourceDir = path.join(
      this.templatesDir,
      "env",
      "cursor",
      "rules"
    );
    const rulesTargetDir = path.join(this.targetDir, ".cursor", "rules");

    if (await fs.pathExists(rulesSourceDir)) {
      await fs.ensureDir(rulesTargetDir);
      await fs.copy(rulesSourceDir, rulesTargetDir);

      const ruleFiles = await fs.readdir(rulesSourceDir);
      ruleFiles.forEach((file) => {
        copiedFiles.push(path.join(rulesTargetDir, file));
      });
    }
  }

  private async copyGeminiSpecificFiles(copiedFiles: string[]): Promise<void> {
    const commandFiles = await fs.readdir(
      path.join(this.templatesDir, "commands")
    );
    const commandTargetDir = path.join(this.targetDir, ".gemini", "commands");

    await fs.ensureDir(commandTargetDir);
    await Promise.all(
      commandFiles
        .filter((file: string) => file.endsWith(".md"))
        .map(async (file: string) => {
          const mdContent = await fs.readFile(
            path.join(this.templatesDir, "commands", file),
            "utf-8"
          );
          const replaced = this.replaceDocsDir(mdContent);
          const { data, content } = matter(replaced);
          const description = (data.description as string) || "";
          const tomlContent = this.generateTomlContent(description, content.trim());
          const tomlFile = file.replace(".md", ".toml");

          await fs.writeFile(
            path.join(commandTargetDir, tomlFile),
            tomlContent
          );
          copiedFiles.push(path.join(commandTargetDir, tomlFile));
        })
    );
  }


  /**
   * Generate TOML content for Gemini commands.
   * Uses triple quotes for multi-line strings.
   */
  private generateTomlContent(description: string, prompt: string): string {
    // Escape any triple quotes in the content
    const escapedDescription = description.replace(/'''/g, "'''");
    const escapedPrompt = prompt.replace(/'''/g, "'''");

    return `description='''${escapedDescription}'''
prompt='''${escapedPrompt}'''
`;
  }

  private replaceDocsDir(content: string): string {
    return content.split('{{docsDir}}').join(this.docsDir);
  }

  /**
   * Copy command templates to the global folder for a specific environment.
   * Global folders are located in the user's home directory.
   */
  async copyCommandsToGlobal(envCode: EnvironmentCode): Promise<string[]> {
    const env = getEnvironment(envCode);
    if (!env || !env.globalCommandPath) {
      throw new Error(`Environment '${envCode}' does not support global setup`);
    }

    const copiedFiles: string[] = [];
    const homeDir = os.homedir();
    const globalTargetDir = path.join(homeDir, env.globalCommandPath);
    const commandsSourceDir = path.join(this.templatesDir, "commands");

    try {
      await fs.ensureDir(globalTargetDir);

      const commandFiles = await fs.readdir(commandsSourceDir);
      for (const file of commandFiles) {
        if (!file.endsWith(".md")) continue;

        const sourceFile = path.join(commandsSourceDir, file);
        const targetFile = path.join(globalTargetDir, file);
        const content = await fs.readFile(sourceFile, "utf-8");
        const replaced = this.replaceDocsDir(content);

        await fs.writeFile(targetFile, replaced);
        copiedFiles.push(targetFile);
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to copy commands to global folder: ${error.message}`);
      }
      throw error;
    }

    return copiedFiles;
  }

  /**
   * Check if any global commands already exist for a specific environment.
   */
  async checkGlobalCommandsExist(envCode: EnvironmentCode): Promise<boolean> {
    const env = getEnvironment(envCode);
    if (!env || !env.globalCommandPath) {
      return false;
    }

    const homeDir = os.homedir();
    const globalTargetDir = path.join(homeDir, env.globalCommandPath);

    if (!(await fs.pathExists(globalTargetDir))) {
      return false;
    }

    const files = await fs.readdir(globalTargetDir);
    return files.some((file: string) => file.endsWith(".md"));
  }
}
