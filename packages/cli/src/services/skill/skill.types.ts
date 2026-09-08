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

export interface RemoveSkillOptions {
  global?: boolean;
  environments?: string[];
}

export interface AddSkillRegistryCommandOptions {
  global?: boolean;
  force?: boolean;
}

export interface RemoveSkillRegistryCommandOptions {
  global?: boolean;
}
