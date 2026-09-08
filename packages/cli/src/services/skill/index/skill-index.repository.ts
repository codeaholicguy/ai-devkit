import fs from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import type { SkillIndexData } from './skill-index.service.js';

export const SKILL_INDEX_PATH = path.join(os.homedir(), '.ai-devkit', 'skills.json');

export class SkillIndexRepository {
  readonly defaultPath = SKILL_INDEX_PATH;

  async exists(indexPath = this.defaultPath): Promise<boolean> {
    return fs.pathExists(indexPath);
  }

  async read(indexPath = this.defaultPath): Promise<SkillIndexData | null> {
    try {
      if (await fs.pathExists(indexPath)) {
        return await fs.readJson(indexPath) as SkillIndexData;
      }
    } catch {
      // Treat unreadable/corrupt indexes as absent; the service decides fallback behavior.
    }

    return null;
  }

  async readRequired(indexPath = this.defaultPath): Promise<SkillIndexData> {
    return await fs.readJson(indexPath) as SkillIndexData;
  }

  async write(index: SkillIndexData, indexPath = this.defaultPath): Promise<void> {
    await fs.ensureDir(path.dirname(indexPath));
    await fs.writeJson(indexPath, index, { spaces: 2 });
  }
}
