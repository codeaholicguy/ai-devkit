import * as fs from 'fs-extra';
import * as path from 'path';
import * as https from 'https';
import * as os from 'os';
import { ConfigManager } from './Config';
import { EnvironmentSelector } from './EnvironmentSelector';
import { getSkillPath } from '../util/env';
import { ensureGitInstalled, cloneRepository } from '../util/git';
import { validateRegistryId, validateSkillName } from '../util/skill';

const REGISTRY_URL = 'https://raw.githubusercontent.com/Codeaholicguy/ai-devkit/main/skills/registry.json';
const SKILL_CACHE_DIR = path.join(os.homedir(), '.ai-devkit', 'skills');

interface SkillRegistry {
  registries: Record<string, string>;
}

interface InstalledSkill {
  name: string;
  registry: string;
  environments: string[];
}

export class SkillManager {
  constructor(
    private configManager: ConfigManager,
    private environmentSelector: EnvironmentSelector = new EnvironmentSelector()
  ) {}

  /**
   * Add a skill to the project
   * @param registryId - e.g., "anthropics/skills"
   * @param skillName - e.g., "frontend-design"
   */
  async addSkill(registryId: string, skillName: string): Promise<void> {
    console.log(`Validating skill: ${skillName} from ${registryId}`);
    validateRegistryId(registryId);
    validateSkillName(skillName);
    await ensureGitInstalled();

    console.log('Fetching registry from GitHub...');
    const registry = await this.fetchRegistry();

    const gitUrl = registry.registries[registryId];
    if (!gitUrl) {
      throw new Error(
        `Registry "${registryId}" not found. Available: ${Object.keys(registry.registries).join(', ')}`
      );
    }

    console.log('Checking local cache...');
    const repoPath = await this.cloneRepositoryToCache(registryId, gitUrl);

    const skillPath = path.join(repoPath, 'skills', skillName);
    if (!await fs.pathExists(skillPath)) {
      throw new Error(
        `Skill "${skillName}" not found in ${registryId}. Check the repository for available skills.`
      );
    }

    const skillMdPath = path.join(skillPath, 'SKILL.md');
    if (!await fs.pathExists(skillMdPath)) {
      throw new Error(
        `Invalid skill: SKILL.md not found in ${skillName}. This may not be a valid Agent Skill.`
      );
    }

    console.log('Loading project configuration...');
    let config = await this.configManager.read();
    if (!config) {
      console.log('No .ai-devkit.json found. Creating configuration...');
      config = await this.configManager.create();
      
      if (config.environments.length === 0) {
        const selectedEnvs = await this.environmentSelector.selectSkillEnvironments();
        config.environments = selectedEnvs;
        await this.configManager.update({ environments: selectedEnvs });
        console.log('Configuration saved.\n');
      }
    }

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);
    
    if (skillCapableEnvs.length === 0) {
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    console.log('Installing skill to project...');
    const targets = this.getInstallationTargets(skillCapableEnvs);
    
    for (const targetDir of targets) {
      const targetPath = path.join(process.cwd(), targetDir, skillName);
      
      if (await fs.pathExists(targetPath)) {
        console.log(`  → ${targetDir}/${skillName} (already exists, skipped)`);
        continue;
      }

      await fs.ensureDir(path.dirname(targetPath));

      try {
        await fs.symlink(skillPath, targetPath, 'dir');
        console.log(`  → ${targetDir}/${skillName} (symlinked)`);
      } catch (error) {
        await fs.copy(skillPath, targetPath);
        console.log(`  → ${targetDir}/${skillName} (copied)`);
      }
    }

    console.log(`\nSuccessfully installed: ${skillName}`);
    console.log(`  Source: ${registryId}`);
    console.log(`  Installed to: ${skillCapableEnvs.join(', ')}`);
  }

  /**
   * List installed skills in the project
   */
  async listSkills(): Promise<InstalledSkill[]> {
    const skills: InstalledSkill[] = [];
    const seenSkills = new Set<string>();

    const config = await this.configManager.read();
    if (!config || config.environments.length === 0) {
      console.log('No .ai-devkit.json found or no environments configured.');
      return [];
    }

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);
    
    if (skillCapableEnvs.length === 0) {
      console.log('No skill-capable environments configured.');
      return [];
    }

    const targets = this.getInstallationTargets(skillCapableEnvs);

    for (const targetDir of targets) {
      const fullPath = path.join(process.cwd(), targetDir);
      
      if (!await fs.pathExists(fullPath)) {
        continue;
      }

      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isDirectory() || entry.isSymbolicLink()) {
          const skillName = entry.name;
          
          if (!seenSkills.has(skillName)) {
            seenSkills.add(skillName);
            
            const skillPath = path.join(fullPath, skillName);
            let registry = 'unknown';
            
            try {
              const realPath = await fs.realpath(skillPath);
              const cacheRelative = path.relative(SKILL_CACHE_DIR, realPath);
              const parts = cacheRelative.split(path.sep);
              if (parts.length >= 2) {
                registry = `${parts[0]}/${parts[1]}`;
              }
            } catch {
              // Ignore errors
            }

            skills.push({
              name: skillName,
              registry,
              environments: skillCapableEnvs,
            });
          }
        }
      }
    }

    return skills;
  }

  /**
   * Remove a skill from the project
   * @param skillName - Name of the skill to remove
   */
  async removeSkill(skillName: string): Promise<void> {
    console.log(`Removing skill: ${skillName}`);
    validateSkillName(skillName);

    const config = await this.configManager.read();
    if (!config || config.environments.length === 0) {
      throw new Error('No .ai-devkit.json found. Run: ai-devkit init');
    }

    const skillCapableEnvs = this.filterSkillCapableEnvironments(config.environments);
    
    if (skillCapableEnvs.length === 0) {
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    const targets = this.getInstallationTargets(skillCapableEnvs);
    let removedCount = 0;

    for (const targetDir of targets) {
      const skillPath = path.join(process.cwd(), targetDir, skillName);
      
      if (await fs.pathExists(skillPath)) {
        await fs.remove(skillPath);
        console.log(`  → Removed from ${targetDir}`);
        removedCount++;
      }
    }

    if (removedCount === 0) {
      console.log(`\nSkill "${skillName}" not found. Nothing to remove.`);
      console.log('Tip: Run "ai-devkit skill list" to see installed skills.');
    } else {
      console.log(`\nSuccessfully removed from ${removedCount} location(s).`);
      console.log(`Note: Cached copy in ~/.ai-devkit/skills/ preserved for other projects.`);
    }
  }

  private async fetchRegistry(): Promise<SkillRegistry> {
    return new Promise((resolve, reject) => {
      https.get(REGISTRY_URL, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`Failed to fetch registry: HTTP ${res.statusCode}`));
          return;
        }

        let data = '';
        res.on('data', (chunk) => data += chunk);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(new Error('Failed to parse registry JSON'));
          }
        });
      }).on('error', (error) => {
        reject(new Error(`Network error fetching registry: ${error.message}`));
      });
    });
  }

  private getInstallationTargets(environments: string[]): string[] {
    const targets: string[] = [];
    
    for (const env of environments) {
      const skillPath = getSkillPath(env as any);
      if (skillPath) {
        targets.push(skillPath);
      }
    }

    if (targets.length === 0) {
      throw new Error('No skill-capable environments configured. Supported: cursor, claude');
    }

    return targets;
  }

  private async cloneRepositoryToCache(registryId: string, gitUrl: string): Promise<string> {
    const repoPath = path.join(SKILL_CACHE_DIR, registryId);
  
    if (await fs.pathExists(repoPath)) {
      console.log('  → Using cached repository');
      return repoPath;
    }
  
    console.log(`  → Cloning ${registryId} (this may take a moment)...`);
    await fs.ensureDir(path.dirname(repoPath));
  
    return await cloneRepository(SKILL_CACHE_DIR, registryId, gitUrl);
  }

  private filterSkillCapableEnvironments(environments: string[]): string[] {
    return environments.filter(env => {
      const skillPath = getSkillPath(env as any);
      return skillPath !== undefined;
    });
  }
}