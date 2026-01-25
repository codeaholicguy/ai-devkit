/**
 * Validates registry ID format
 * @param registryId - Expected format: "org/repo"
 * @throws Error if format is invalid or contains unsafe characters
 */
export function validateRegistryId(registryId: string): void {
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(registryId)) {
    throw new Error(`Invalid registry ID format: "${registryId}". Expected format: "org/repo"`);
  }
  
  if (registryId.includes('..') || registryId.includes('~')) {
    throw new Error('Invalid characters in registry ID');
  }
}

/**
 * Validates skill name according to Agent Skills specification
 * @param skillName - Must be lowercase, alphanumeric with hyphens
 * @throws Error if name doesn't meet requirements
 */
export function validateSkillName(skillName: string): void {
  if (!/^[a-z0-9-]+$/.test(skillName)) {
    throw new Error(
      `Invalid skill name: "${skillName}". Must contain only lowercase letters, numbers, and hyphens.`
    );
  }

  if (skillName.startsWith('-') || skillName.endsWith('-')) {
    throw new Error('Skill name cannot start or end with a hyphen.');
  }

  if (skillName.includes('--')) {
    throw new Error('Skill name cannot contain consecutive hyphens.');
  }
}