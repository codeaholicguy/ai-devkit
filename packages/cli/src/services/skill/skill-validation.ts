import { ValidationError } from "../../util/errors.js";

/**
 * Validates registry ID format
 * @param registryId - Expected format: "org/repo"
 * @throws Error if format is invalid or contains unsafe characters
 */
export function validateRegistryId(registryId: string): void {
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/.test(registryId)) {
    throw new ValidationError(
      `Invalid registry ID format: "${registryId}". Expected format: "org/repo"`,
      { registryId },
    );
  }

  if (registryId.includes("..") || registryId.includes("~")) {
    throw new ValidationError("Invalid characters in registry ID", { registryId });
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
      { skillName },
    );
  }

  if (skillName.startsWith("-") || skillName.endsWith("-")) {
    throw new ValidationError("Skill name cannot start or end with a hyphen.", { skillName });
  }

  if (skillName.includes("--")) {
    throw new ValidationError("Skill name cannot contain consecutive hyphens.", { skillName });
  }
}

/**
 * Checks if a skill name is valid without throwing
 */
export function isValidSkillName(name: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(name);
}

/**
 * Translate a simple glob to an anchored RegExp for filtering skill names.
 * `*` matches any run of name characters, `?` matches exactly one; anything
 * else is literal. Skill names are `[a-z0-9-]`, so no character classes are
 * needed.
 */
export function globToRegExp(glob: string): RegExp {
  let source = "^";
  for (const character of glob) {
    if (character === "*") {
      source += "[a-z0-9-]*";
    } else if (character === "?") {
      source += "[a-z0-9-]";
    } else {
      source += character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    }
  }
  return new RegExp(`${source}$`);
}
