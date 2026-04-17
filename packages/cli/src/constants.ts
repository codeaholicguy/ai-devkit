/**
 * Registry identifier for the AI DevKit built-in skills.
 */
export const BUILTIN_SKILL_REGISTRY = 'codeaholicguy/ai-devkit';

/**
 * Canonical list of built-in skills that ship with AI DevKit. Keep in sync
 * with the skills published under the {@link BUILTIN_SKILL_REGISTRY}
 * registry. Commands that need to install or reference the curated set
 * (e.g., `ai-devkit init`, future `doctor`/`upgrade` commands) should import
 * from here rather than hard-coding names locally.
 */
export const BUILTIN_SKILL_NAMES = [
  'dev-lifecycle',
  'debug',
  'capture-knowledge',
  'memory',
  'simplify-implementation',
  'technical-writer',
  'verify',
  'tdd'
] as const;

export type BuiltinSkillName = typeof BUILTIN_SKILL_NAMES[number];
