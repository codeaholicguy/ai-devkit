export interface InstalledSkill {
  name: string;
  registry: string;
  environments: string[];
}

export interface GlobalInstalledSkill {
  name: string;
  environments: string[];
  path: string;
}

export interface RegistrySkillChoice {
  name: string;
  description?: string;
}

export interface AddSkillOptions {
  global?: boolean;
  environments?: string[];
}

export type SkillInstallAction = "symlinked" | "copied" | "skipped";

export interface SkillInstallItem {
  skillName: string;
  target: string;
  action: SkillInstallAction;
}

export interface SkillInstallResult {
  status: "installed" | "matched";
  registryId: string;
  installMode: "global" | "project";
  environments: string[];
  items: SkillInstallItem[];
}

export interface RemoveSkillOptions {
  global?: boolean;
  environments?: string[];
}

export interface SkillRemoveResult {
  skillName: string;
  scope: "global" | "project";
  removedTargets: string[];
  failures: string[];
}

export interface AddSkillRegistryCommandOptions {
  global?: boolean;
  force?: boolean;
}

export interface RemoveSkillRegistryCommandOptions {
  global?: boolean;
}
