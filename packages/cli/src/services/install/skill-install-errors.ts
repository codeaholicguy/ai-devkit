import { CliError, GitError, NotFoundError } from "../../util/errors.js";

export function isUnreachableSkillInstallError(error: unknown): boolean {
  if (error instanceof GitError) {
    return true;
  }

  if (error instanceof CliError && error.code === "NETWORK_ERROR") {
    return true;
  }

  if (error instanceof NotFoundError) {
    if (error.details && "skillName" in error.details) {
      return false;
    }
    return true;
  }

  return false;
}

export function formatUnreachableSkillWarning(registryId: string, skillName: string): string {
  return `Skill ${registryId}/${skillName}: could not be fetched (registry may be private or unreachable).`;
}
