import * as fs from "fs-extra";
import * as path from "path";
import matter from "gray-matter";
import { Phase, EnvironmentCode, EnvironmentDefinition } from "../types";
import { getEnvironment } from "../util/env";

export class TemplateManager {
  private templatesDir: string;
  private targetDir: string;

  constructor(targetDir: string = process.cwd()) {
    this.templatesDir = path.join(__dirname, "../../templates");
    this.targetDir = targetDir;
  }

  async copyPhaseTemplate(phase: Phase): Promise<string> {
    const sourceFile = path.join(this.templatesDir, "phases", `${phase}.md`);
    const targetDir = path.join(this.targetDir, "docs", "ai", phase);
    const targetFile = path.join(targetDir, "README.md");

    await fs.ensureDir(targetDir);
    await fs.copy(sourceFile, targetFile);

    return targetFile;
  }

  async fileExists(phase: Phase): Promise<boolean> {
    const targetFile = path.join(
      this.targetDir,
      "docs",
      "ai",
      phase,
      "README.md"
    );
    return fs.pathExists(targetFile);
  }

  async setupMultipleEnvironments(
    environmentIds: EnvironmentCode[]
  ): Promise<string[]> {
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

  private async setupSingleEnvironment(
    env: EnvironmentDefinition
  ): Promise<string[]> {
    const copiedFiles: string[] = [];

    try {
      const contextSource = path.join(this.templatesDir, "env", "base.md");
      const contextTarget = path.join(this.targetDir, env.contextFileName);

      if (await fs.pathExists(contextSource)) {
        await fs.copy(contextSource, contextTarget);
        copiedFiles.push(contextTarget);
      } else {
        console.warn(`Warning: Context file not found: ${contextSource}`);
      }

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
      console.error(`Error setting up environment ${env.name}:`, error);
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
            await fs.copy(
              path.join(commandsSourceDir, file),
              path.join(commandsTargetDir, targetFile)
            );
            copiedFiles.push(path.join(commandsTargetDir, targetFile));
          })
      );
    } else {
      console.warn(
        `Warning: Commands directory not found: ${commandsSourceDir}`
      );
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
          const { data, content } = matter(mdContent);
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
}
