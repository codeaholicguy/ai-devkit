import matter from 'gray-matter';
import { ValidationError } from './errors';

/**
 * Validates registry ID format
 * @param registryId - Expected format: "org/repo"
 * @throws Error if format is invalid or contains unsafe characters
 */
export function validateRegistryId(registryId: string): void {
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(registryId)) {
    throw new ValidationError(`Invalid registry ID format: "${registryId}". Expected format: "org/repo"`, { registryId });
  }

  if (registryId.includes('..') || registryId.includes('~')) {
    throw new ValidationError('Invalid characters in registry ID', { registryId });
  }
}

/**
 * Validates skill name according to Agent Skills specification
 * @param skillName - Must be lowercase, alphanumeric with hyphens
 * @throws Error if name doesn't meet requirements
 */
export function validateSkillName(skillName: string): void {
  if (!/^[a-z0-9-]+$/.test(skillName)) {
    throw new ValidationError(
      `Invalid skill name: "${skillName}". Must contain only lowercase letters, numbers, and hyphens.`,
      { skillName }
    );
  }

  if (skillName.startsWith('-') || skillName.endsWith('-')) {
    throw new ValidationError('Skill name cannot start or end with a hyphen.', { skillName });
  }

  if (skillName.includes('--')) {
    throw new ValidationError('Skill name cannot contain consecutive hyphens.', { skillName });
  }
}

/**
 * Checks if a skill name is valid without throwing
 */
export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

/**
 * Extract skill description from SKILL.md frontmatter
 * @param content - Content of SKILL.md file
 * @returns Description from frontmatter or first non-empty paragraph
 */
export function extractSkillDescription(content: string): string {
  try {
    const parsed = matter(content);

    // Try to get description from frontmatter
    if (parsed.data && parsed.data.description) {
      return String(parsed.data.description).trim();
    }

    // Fallback: use first non-empty paragraph from content
    const lines = parsed.content
      .split('\n')
      .filter((l: string) => l.trim() && !l.startsWith('#'));

    return lines[0]?.trim() || 'No description available';
  } catch (error) {
    // If parsing fails, return fallback
    return 'No description available';
  }
}