export interface DocSection {
  id: string;
  title: string;
  description: string;
}

export const DOC_SECTIONS: DocSection[] = [
  {
    id: 'start',
    title: 'Start',
    description: 'What AI DevKit is, how to install it, and which agents it supports.',
  },
  {
    id: 'workflows',
    title: 'Workflows',
    description: 'Plan, build, debug, and understand code with your agent.',
  },
  {
    id: 'features',
    title: 'Features',
    description: 'Skills, memory, the agent console, channels, and plugins.',
  },
  {
    id: 'reference',
    title: 'Reference',
    description: 'Config file keys, health checks, and the devkitd runtime.',
  },
];

export function sectionIndex(id?: string): number {
  const index = DOC_SECTIONS.findIndex((section) => section.id === id);
  return index === -1 ? DOC_SECTIONS.length : index;
}

export function getSection(id?: string): DocSection | undefined {
  return DOC_SECTIONS.find((section) => section.id === id);
}
