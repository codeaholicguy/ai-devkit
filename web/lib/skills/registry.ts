import fs from 'fs';
import path from 'path';

const indexPath = path.join(process.cwd(), '..', 'skills', 'index.json');

/** Number of registry skills at build time, for static copy. Null if the index is unavailable. */
export function getRegistrySkillCount(): number | null {
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as { skills?: unknown[] };
    return Array.isArray(index.skills) ? index.skills.length : null;
  } catch {
    return null;
  }
}
