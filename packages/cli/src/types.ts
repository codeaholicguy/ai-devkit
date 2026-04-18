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
  skillPath?: string;
  globalSkillPath?: string;
  description?: string;
  isCustomCommandPath?: boolean;
  customCommandExtension?: string;
  globalCommandPath?: string;
  mcpConfigPath?: string;
}

export type EnvironmentCode = 'cursor' | 'claude' | 'github' | 'gemini' | 'codex' | 'windsurf' | 'kilocode' | 'amp' | 'opencode' | 'roo' | 'antigravity';

export const DEFAULT_DOCS_DIR = 'docs/ai';

export interface DevKitConfig {
  version: string;
  paths?: {
    docs?: string;
  };
  memory?: {
    path?: string;
  };
  environments: EnvironmentCode[];
  phases: Phase[];
  registries?: Record<string, string>;
  skills?: ConfigSkill[];
  mcpServers?: Record<string, McpServerDefinition>;
  createdAt: string;
  updatedAt: string;
}

export interface ConfigSkill {
  registry: string;
  name: string;
}

export type McpTransport = 'stdio' | 'http' | 'sse';

export const MCP_TRANSPORTS: McpTransport[] = ['stdio', 'http', 'sse'];

export interface McpServerDefinition {
  transport: McpTransport;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface GlobalDevKitConfig {
  registries?: Record<string, string>;
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
