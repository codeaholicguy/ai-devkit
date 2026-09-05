import { isValidSkillName } from '../util/skill.js';
import { getErrorMessage } from '../util/text.js';
import { ui } from '../util/terminal-ui.js';

const BUILTIN_SKILLS_URL =
  'https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/built-in.json';

export const BUILTIN_SKILL_REGISTRY = 'codeaholicguy/ai-devkit';

const FALLBACK_BUILTIN_SKILL_NAMES = [
  'agent-communication',
  'agent-management',
  'ai-devkit-setup',
  'remote-from-slack',
  'remote-from-telegram',
  'dev-commit',
  'dev-lifecycle',
  'dev-worktree',
  'dev-requirements',
  'dev-design',
  'dev-planning',
  'dev-implementation',
  'dev-testing',
  'dev-review',
  'dev-pr',
  'structured-debug',
  'document-code',
  'memory',
  'task',
  'simplify-implementation',
  'brainstorm',
  'verify',
  'tdd',
] as const;

let builtInSkillNamesPromise: Promise<readonly string[]> | undefined;

export function getBuiltinSkillNames(): Promise<readonly string[]> {
  builtInSkillNamesPromise ??= loadBuiltinSkillNames();

  return builtInSkillNamesPromise;
}

async function loadBuiltinSkillNames(): Promise<readonly string[]> {
  try {
    const response = await fetch(BUILTIN_SKILLS_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const manifest: unknown = await response.json();
    if (!Array.isArray(manifest) || manifest.length === 0) {
      throw new Error('manifest must be a non-empty array');
    }
    if (!manifest.every(name => typeof name === 'string' && isValidSkillName(name))) {
      throw new Error('manifest entries must be valid, non-empty skill names');
    }
    if (new Set(manifest).size !== manifest.length) {
      throw new Error('manifest skill names must be unique');
    }

    return manifest;
  } catch (error: unknown) {
    ui.warning(
      `Failed to load built-in skills manifest: ${getErrorMessage(error)}. Using bundled fallback.`
    );
    return FALLBACK_BUILTIN_SKILL_NAMES;
  }
}
