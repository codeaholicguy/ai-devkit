import * as fs from 'fs-extra';
import * as path from 'path';
import { ENVIRONMENT_DEFINITIONS } from '../util/env';

/** Start of the managed block; entire block is replaced on update. */
export const AI_DEVKIT_GITIGNORE_START = '# --- ai-devkit (managed) ---';

/** End marker for the managed block. */
export const AI_DEVKIT_GITIGNORE_END = '# --- end ai-devkit ---';

/**
 * Turn an environment `commandPath` into a single .gitignore directory line.
 * Only repo-local command folders from init are included (see TemplateManager.copyCommands /
 * copyGeminiSpecificFiles). Returns null if the path is unsafe or empty.
 */
export function commandPathToGitignoreDirPattern(commandPath: string): string | null {
  let s = commandPath.trim().replace(/\\/g, '/');
  while (s.startsWith('./')) {
    s = s.slice(2);
  }
  if (!s) {
    return null;
  }
  if (path.isAbsolute(s)) {
    return null;
  }
  const parts = s.split('/');
  if (parts.some(p => p === '..')) {
    return null;
  }
  if (parts.some(p => p === '')) {
    return null;
  }
  const dirLine = s.endsWith('/') ? s : `${s}/`;
  return dirLine;
}

/**
 * Sorted, deduplicated ignore lines for each supported environment's `commandPath` in
 * {@link ENVIRONMENT_DEFINITIONS}. Does not include skill dirs or global (home) command paths.
 */
export function collectInitCommandPathIgnorePatterns(): string[] {
  const set = new Set<string>();
  for (const env of Object.values(ENVIRONMENT_DEFINITIONS)) {
    const pattern = commandPathToGitignoreDirPattern(env.commandPath);
    if (pattern) {
      set.add(pattern);
    }
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * Normalize docs dir for .gitignore: relative, forward slashes, no `..`.
 * @throws if path is empty, absolute, or unsafe
 */
export function normalizeDocsDirForIgnore(docsDir: string): string {
  let s = docsDir.trim().replace(/\\/g, '/');
  while (s.startsWith('./')) {
    s = s.slice(2);
  }
  if (!s) {
    throw new Error('docs directory must be a non-empty relative path');
  }
  if (path.isAbsolute(s)) {
    throw new Error('docs directory must be a relative path');
  }
  const parts = s.split('/');
  if (parts.some(p => p === '..')) {
    throw new Error('docs directory must not contain parent path segments');
  }
  if (parts.some(p => p === '')) {
    throw new Error('docs directory must not contain empty path segments');
  }
  return s;
}

export function buildManagedGitignoreBody(docsDir: string): string {
  const norm = normalizeDocsDirForIgnore(docsDir);
  const dirLine = norm.endsWith('/') ? norm : `${norm}/`;
  const toolLines = collectInitCommandPathIgnorePatterns().join('\n');
  return `.ai-devkit.json\n${dirLine}\n${toolLines}\n`;
}

/**
 * Insert or replace the ai-devkit managed block. Preserves all content outside the block.
 */
export function mergeAiDevkitGitignoreBlock(existingContent: string, docsDir: string): string {
  const inner = buildManagedGitignoreBody(docsDir);
  const block = `${AI_DEVKIT_GITIGNORE_START}\n${inner}${AI_DEVKIT_GITIGNORE_END}\n`;

  const startIdx = existingContent.indexOf(AI_DEVKIT_GITIGNORE_START);
  if (startIdx === -1) {
    if (existingContent.trim() === '') {
      return block;
    }
    const trimmedEnd = existingContent.replace(/\s+$/, '');
    return `${trimmedEnd}\n\n${block}`;
  }

  const searchFrom = startIdx + AI_DEVKIT_GITIGNORE_START.length;
  const endMarkerIdx = existingContent.indexOf(AI_DEVKIT_GITIGNORE_END, searchFrom);
  if (endMarkerIdx === -1) {
    const before = existingContent.slice(0, startIdx).replace(/\s+$/, '');
    const prefix = before === '' ? '' : `${before}\n\n`;
    return `${prefix}${block}`;
  }

  const endAfterLine = endMarkerIdx + AI_DEVKIT_GITIGNORE_END.length;
  let afterStart = endAfterLine;
  while (afterStart < existingContent.length && existingContent[afterStart] === '\n') {
    afterStart += 1;
  }

  const before = existingContent.slice(0, startIdx);
  const after = existingContent.slice(afterStart);
  return `${before}${block}${after}`;
}

export async function writeGitignoreWithAiDevkitBlock(root: string, docsDir: string): Promise<void> {
  const gitignorePath = path.join(root, '.gitignore');
  let existing = '';
  if (await fs.pathExists(gitignorePath)) {
    existing = await fs.readFile(gitignorePath, 'utf8');
  }
  const merged = mergeAiDevkitGitignoreBlock(existing, docsDir);
  if (merged === existing) {
    return;
  }
  await fs.writeFile(gitignorePath, merged, 'utf8');
}
