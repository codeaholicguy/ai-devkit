import { EnvironmentCode, McpServerDefinition } from '../../../types';

export interface McpMergePlan {
  agentType: EnvironmentCode;
  newServers: string[];
  conflictServers: string[];
  skippedServers: string[];
  resolvedConflicts: string[];
}

export interface McpAgentGenerator {
  readonly agentType: EnvironmentCode;

  /**
   * Read existing agent config, diff against desired servers, return merge plan.
   */
  plan(
    servers: Record<string, McpServerDefinition>,
    projectRoot: string
  ): Promise<McpMergePlan>;

  /**
   * Write the merged config to disk based on the resolved plan.
   */
  apply(
    plan: McpMergePlan,
    servers: Record<string, McpServerDefinition>,
    projectRoot: string
  ): Promise<void>;
}

export interface McpInstallReport {
  installed: number;
  skipped: number;
  conflicts: number;
  failed: number;
}
