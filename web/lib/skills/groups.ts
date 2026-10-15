import type { BuiltInSkill } from './built-in';

export interface SkillGroup {
  id: string;
  title: string;
  categories: string[];
}

/** Built-in skills on /skills, grouped by what developers reach for them to do. */
export const SKILL_GROUPS: SkillGroup[] = [
  { id: 'plan-and-build', title: 'Plan and build', categories: ['Workflow'] },
  {
    id: 'quality',
    title: 'Quality',
    categories: ['Debugging', 'Testing', 'Verification', 'Review', 'Refactoring'],
  },
  { id: 'knowledge', title: 'Knowledge', categories: ['Memory', 'Documentation'] },
  { id: 'agents', title: 'Agents', categories: ['Multi-agent', 'Remote'] },
  { id: 'setup-and-release', title: 'Setup and release', categories: ['Setup', 'Release'] },
];

/** Group skills, keeping any skill whose category has no group in a final "More" group. */
export function groupSkills(skills: BuiltInSkill[]): { group: SkillGroup; skills: BuiltInSkill[] }[] {
  const grouped = SKILL_GROUPS.map((group) => ({
    group,
    skills: skills.filter((skill) => group.categories.includes(skill.category)),
  }));
  const known = new Set(SKILL_GROUPS.flatMap((group) => group.categories));
  const rest = skills.filter((skill) => !known.has(skill.category));
  if (rest.length > 0) {
    grouped.push({ group: { id: 'more', title: 'More', categories: [] }, skills: rest });
  }
  return grouped.filter((entry) => entry.skills.length > 0);
}
