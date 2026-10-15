import type { SeoCluster } from '../seo/keywords';

export interface FaqCategory {
  id: string;
  title: string;
  description: string;
}

export const FAQ_CATEGORIES: FaqCategory[] = [
  {
    id: 'compare',
    title: 'Compare',
    description: 'How AI DevKit differs from other frameworks for AI coding agents.',
  },
  {
    id: 'guide',
    title: 'Guides',
    description: 'Memory, agent instruction files, automation, and fixes for specific agents.',
  },
];

export function getFaqCategory(id?: string): FaqCategory | undefined {
  return FAQ_CATEGORIES.find((category) => category.id === id);
}

/** Topic groups on the FAQ home, in reading order. */
export const TOPIC_GROUPS: { cluster: SeoCluster; title: string }[] = [
  { cluster: 'overview', title: 'Choosing AI coding tools' },
  { cluster: 'agents', title: 'Multi-agent and control plane' },
  { cluster: 'memory', title: 'Memory and context' },
  { cluster: 'workflow', title: 'Workflow and spec-driven development' },
  { cluster: 'skills', title: 'Skills' },
  { cluster: 'debugging', title: 'Reliability and debugging' },
  { cluster: 'setup', title: 'Agent files and tool setup' },
];
