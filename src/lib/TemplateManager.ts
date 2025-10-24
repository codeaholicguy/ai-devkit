import * as fs from "fs-extra";
import * as path from "path";
import { Phase, Environment } from "../types";

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

  async copyEnvironmentTemplates(environment: Environment): Promise<string[]> {
    const copiedFiles: string[] = [];

    if (environment === "cursor" || environment === "all") {
      const cursorFiles = await this.copyCursorTemplates();
      copiedFiles.push(...cursorFiles);
    }

    if (environment === "claude" || environment === "all") {
      const claudeFiles = await this.copyClaudeTemplates();
      copiedFiles.push(...claudeFiles);
    }

    if (environment === "copilot" || environment === "all") {
      const copilotFiles = await this.copyCopilotTemplates();
      copiedFiles.push(...copilotFiles);
    }

    return copiedFiles;
  }

  private async copyCursorTemplates(): Promise<string[]> {
    const files: string[] = [];

    const workspaceSource = path.join(
      this.templatesDir,
      "env",
      "cursor",
      "AGENTS.md",
    );
    const workspaceTarget = path.join(this.targetDir, "AGENTS.md");
    await fs.copy(workspaceSource, workspaceTarget);
    files.push(workspaceTarget);

    const rulesSourceDir = path.join(
      this.templatesDir,
      "env",
      "cursor",
      "rules",
    );
    const rulesTargetDir = path.join(this.targetDir, ".cursor", "rules");
    await fs.ensureDir(rulesTargetDir);
    await fs.copy(rulesSourceDir, rulesTargetDir);

    const ruleFiles = await fs.readdir(rulesSourceDir);
    ruleFiles.forEach((file: string) => {
      files.push(path.join(rulesTargetDir, file));
    });

    const commandsSourceDir = path.join(this.templatesDir, "commands");
    const commandsTargetDir = path.join(this.targetDir, ".cursor", "commands");
    await fs.ensureDir(commandsTargetDir);
    await fs.copy(commandsSourceDir, commandsTargetDir);

    const commandFiles = await fs.readdir(commandsSourceDir);
    commandFiles.forEach((file: string) => {
      files.push(path.join(commandsTargetDir, file));
    });

    return files;
  }

  private async copyClaudeTemplates(): Promise<string[]> {
    const files: string[] = [];

    const workspaceSource = path.join(
      this.templatesDir,
      "env",
      "claude",
      "CLAUDE.md",
    );
    const workspaceTarget = path.join(this.targetDir, "CLAUDE.md");
    await fs.copy(workspaceSource, workspaceTarget);
    files.push(workspaceTarget);

    const commandsSourceDir = path.join(this.templatesDir, "commands");
    const commandsTargetDir = path.join(this.targetDir, ".claude", "commands");
    await fs.ensureDir(commandsTargetDir);
    await fs.copy(commandsSourceDir, commandsTargetDir);

    const commandFiles = await fs.readdir(commandsSourceDir);
    commandFiles.forEach((file: string) => {
      files.push(path.join(commandsTargetDir, file));
    });

    return files;
  }

  private async copyCopilotTemplates(): Promise<string[]> {
    const files: string[] = [];

    // Copy prompts to .github/prompts/ and rename to .prompt.md
    const promptsSourceDir = path.join(this.templatesDir, "commands");
    const promptsTargetDir = path.join(this.targetDir, ".github", "prompts");
    await fs.ensureDir(promptsTargetDir);

    const promptFiles = await fs.readdir(promptsSourceDir);
    for (const file of promptFiles) {
      if (file.endsWith(".md")) {
        const sourceFile = path.join(promptsSourceDir, file);
        const targetFile = path.join(
          promptsTargetDir,
          file.replace(".md", ".prompt.md"),
        );
        await fs.copy(sourceFile, targetFile);
        files.push(targetFile);
      }
    }

    return files;
  }

  async fileExists(phase: Phase): Promise<boolean> {
    const targetFile = path.join(
      this.targetDir,
      "docs",
      "ai",
      phase,
      "README.md",
    );
    return fs.pathExists(targetFile);
  }

  async environmentFilesExist(environment: Environment): Promise<boolean> {
    if (environment === "cursor" || environment === "all") {
      const rulesExists = await fs.pathExists(
        path.join(this.targetDir, ".cursor", "rules"),
      );
      if (rulesExists) return true;
    }

    if (environment === "claude" || environment === "all") {
      const workspaceExists = await fs.pathExists(
        path.join(this.targetDir, ".claude", "CLAUDE.md"),
      );
      if (workspaceExists) return true;
    }

    if (environment === "copilot" || environment === "all") {
      const promptsExists = await fs.pathExists(
        path.join(this.targetDir, ".github", "prompts"),
      );
      if (promptsExists) return true;
    }

    return false;
  }
}
