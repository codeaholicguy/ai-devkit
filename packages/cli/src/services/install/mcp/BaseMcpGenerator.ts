import { EnvironmentCode, McpServerDefinition } from '../../../types';
import { McpAgentGenerator, McpMergePlan } from './types';
import { deepEqual } from '../../../util/object';

/**
 * Base class for per-agent MCP config generators.
 *
 * Subclasses provide format-specific conversion, reading, and writing.
 * The shared plan/apply diff-and-merge logic lives here.
 */
export abstract class BaseMcpGenerator implements McpAgentGenerator {
  abstract readonly agentType: EnvironmentCode;

  protected abstract toAgentFormat(def: McpServerDefinition): Record<string, unknown>;
  protected abstract readExistingServers(projectRoot: string): Promise<Record<string, unknown>>;
  protected abstract writeServers(
    projectRoot: string,
    mergedServers: Record<string, unknown>
  ): Promise<void>;

  async plan(
    servers: Record<string, McpServerDefinition>,
    projectRoot: string
  ): Promise<McpMergePlan> {
    const existingServers = await this.readExistingServers(projectRoot);

    const plan: McpMergePlan = {
      agentType: this.agentType,
      newServers: [],
      conflictServers: [],
      skippedServers: [],
      resolvedConflicts: [],
    };

    for (const [name, def] of Object.entries(servers)) {
      const desired = this.toAgentFormat(def);
      const current = existingServers[name];

      if (!current) {
        plan.newServers.push(name);
      } else if (deepEqual(desired, current)) {
        plan.skippedServers.push(name);
      } else {
        plan.conflictServers.push(name);
      }
    }

    return plan;
  }

  async apply(
    plan: McpMergePlan,
    servers: Record<string, McpServerDefinition>,
    projectRoot: string
  ): Promise<void> {
    const existingServers = await this.readExistingServers(projectRoot);
    const toWrite = new Set([...plan.newServers, ...plan.resolvedConflicts]);

    for (const name of toWrite) {
      const def = servers[name];
      if (def) {
        existingServers[name] = this.toAgentFormat(def);
      }
    }

    await this.writeServers(projectRoot, existingServers);
  }
}
