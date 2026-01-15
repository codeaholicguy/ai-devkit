export type Phase =
  | 'requirements'
  | 'design'
  | 'planning'
  | 'implementation'
  | 'testing'
  | 'deployment'
  | 'monitoring';

export interface EnvironmentDefinition {
  code: string;
  name: string;
  contextFileName: string;
  commandPath: string;
  description?: string;
  isCustomCommandPath?: boolean;
  customCommandExtension?: string;
}

export type EnvironmentCode = 'cursor' | 'claude' | 'github' | 'gemini' | 'codex' | 'windsurf' | 'kilocode' | 'amp' | 'opencode' | 'roo' | 'antigravity';

export interface DevKitConfig {
  version: string;
  environments: EnvironmentCode[];
  initializedPhases: Phase[];
  createdAt: string;
  updatedAt: string;
}

export interface PhaseMetadata {
  phase: string;
  title: string;
  description: string;
}

export const AVAILABLE_PHASES: Phase[] = [
  'requirements',
  'design',
  'planning',
  'implementation',
  'testing',
  'deployment',
  'monitoring'
];

export const PHASE_DISPLAY_NAMES: Record<Phase, string> = {
  requirements: 'Requirements & Problem Understanding',
  design: 'System Design & Architecture',
  planning: 'Project Planning & Task Breakdown',
  implementation: 'Implementation Guide',
  testing: 'Testing Strategy',
  deployment: 'Deployment Strategy',
  monitoring: 'Monitoring & Observability'
};