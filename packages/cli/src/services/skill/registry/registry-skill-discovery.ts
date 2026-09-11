import fs from "fs-extra";
import path from "node:path";
import { CliError, NotFoundError } from "../../../util/errors.js";
import { isValidSkillName } from "../skill-validation.js";
import { extractSkillDescription } from "../skill-description.js";

export const LOCAL_REGISTRY_MAX_ENTRIES = 10_000;
export const LOCAL_REGISTRY_MAX_SKILL_MD_BYTES = 1024 * 1024;

export interface DiscoveredRegistrySkill {
  name: string;
  description: string;
}

function isStrictlyContained(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate);
  return (
    Boolean(relative) &&
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

export async function resolveContainedSkill(
  registryId: string,
  registryRoot: string,
  skillName: string,
): Promise<string> {
  const canonicalRoot = await fs.realpath(registryRoot);
  const skillsRoot = await fs.realpath(path.join(canonicalRoot, "skills"));
  const skillPath = path.join(skillsRoot, skillName);
  let canonicalSkill: string;
  let canonicalMetadata: string;
  try {
    canonicalSkill = await fs.realpath(skillPath);
    canonicalMetadata = await fs.realpath(path.join(skillPath, "SKILL.md"));
  } catch {
    throw new NotFoundError(
      `Skill "${skillName}" or its SKILL.md was not found in ${registryId}.`,
      { registryId, skillName },
    );
  }
  if (
    !isStrictlyContained(skillsRoot, canonicalSkill) ||
    !isStrictlyContained(skillsRoot, canonicalMetadata) ||
    !isStrictlyContained(canonicalSkill, canonicalMetadata)
  ) {
    throw new CliError(
      `Skill "${skillName}" resolves outside local registry "${registryId}"; refusing to use it.`,
      "LOCAL_REGISTRY_ESCAPE",
      { registryId, skillName },
    );
  }
  const metadataSize = (await fs.stat(canonicalMetadata)).size;
  if (metadataSize > LOCAL_REGISTRY_MAX_SKILL_MD_BYTES) {
    throw new CliError(
      `SKILL.md for "${skillName}" is too large (${metadataSize} bytes; limit ${LOCAL_REGISTRY_MAX_SKILL_MD_BYTES}).`,
      "LOCAL_REGISTRY_TOO_LARGE",
    );
  }
  return canonicalSkill;
}

export async function discoverRegistrySkills(
  registryId: string,
  registryRoot: string,
): Promise<DiscoveredRegistrySkill[]> {
  const canonicalRoot = await fs.realpath(registryRoot);
  const skillsRoot = await fs.realpath(path.join(canonicalRoot, "skills"));
  if (!isStrictlyContained(canonicalRoot, skillsRoot)) {
    throw new CliError(
      `Skills directory resolves outside local registry "${registryId}".`,
      "LOCAL_REGISTRY_ESCAPE",
    );
  }

  const directory = await fs.opendir(skillsRoot);
  const skills: DiscoveredRegistrySkill[] = [];
  let entries = 0;
  for await (const entry of directory) {
    entries += 1;
    if (entries > LOCAL_REGISTRY_MAX_ENTRIES) {
      throw new CliError(
        `Local registry "${registryId}" exceeds the ${LOCAL_REGISTRY_MAX_ENTRIES} entry limit.`,
        "LOCAL_REGISTRY_TOO_LARGE",
      );
    }
    if ((!entry.isDirectory() && !entry.isSymbolicLink()) || !isValidSkillName(entry.name))
      continue;
    const metadataPath = path.join(skillsRoot, entry.name, "SKILL.md");
    if (!(await fs.pathExists(metadataPath))) continue;
    const skillPath = await resolveContainedSkill(registryId, canonicalRoot, entry.name);
    const content = await fs.readFile(path.join(skillPath, "SKILL.md"), "utf8");
    skills.push({
      name: entry.name,
      description: extractSkillDescription(content),
    });
  }
  return skills.sort((left, right) => left.name.localeCompare(right.name));
}
