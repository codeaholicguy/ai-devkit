import type { SkillInstallMode } from "../../types.js";

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
  /** Copy the skill folder or symlink it (default). */
  mode?: SkillInstallMode;
  /** Replace a symlinked install with a copy when `mode` is `copy`. */
  overwrite?: boolean;
}

/** `conflict`: a copy was requested but a symlink is installed; `overwrite` resolves it. */
export type SkillInstallAction = "symlinked" | "copied" | "skipped" | "conflict";

export interface SkillInstallItem {
  skillName: string;
  target: string;
  action: SkillInstallAction;
  reason?: string;
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
