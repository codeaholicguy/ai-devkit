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

export interface AddAllSkillOptions extends AddSkillOptions {
  /** Glob of skill names to skip (e.g., "design-ux-writing", "*-writing"). */
  exclude?: string;
  /** Report what would install without touching the filesystem or config. */
  dryRun?: boolean;
  /**
   * Called before a non-dry-run bulk install when the registry offers more
   * than 20 skills; return false to cancel. Lets the command layer own the
   * TTY/confirm policy while the service owns enumeration.
   */
  confirmInstall?: (skillCount: number) => Promise<boolean>;
}

export type AddAllSkillItemStatus = "installed" | "skipped" | "failed";

export interface AddAllSkillItem {
  skill: string;
  status: AddAllSkillItemStatus;
  error?: string;
}

export interface AddAllSkillsResult {
  registryId: string;
  dryRun: boolean;
  /** Installable skills considered, after --exclude filtering. */
  total: number;
  installed: number;
  skipped: number;
  failed: number;
  items: AddAllSkillItem[];
}

export interface RemoveSkillRegistryCommandOptions {
  global?: boolean;
}
