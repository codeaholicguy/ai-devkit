import fs from "fs-extra";
import * as path from "path";
import { fileURLToPath } from "url";

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

    if (env.code === "cursor") {
      return fs.pathExists(path.join(this.targetDir, ".cursor", "rules"));
    }

    return false;
  }

  private async setupSingleEnvironment(
    env: EnvironmentDefinition
  ): Promise<string[]> {
    const copiedFiles: string[] = [];

    try {
      switch (env.code) {
        case "cursor":
          await this.copyCursorSpecificFiles(copiedFiles);
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

}
