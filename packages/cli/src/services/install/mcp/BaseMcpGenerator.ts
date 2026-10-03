import * as path from "path";
import { EnvironmentCode, McpServerDefinition } from "../../../types.js";
import { McpAgentGenerator, McpConfigScope, McpMergePlan } from "./types.js";
import { deepEqual } from "../../../util/object.js";

/**
 * Base class for per-agent MCP config generators.
 *
 * Subclasses provide format-specific conversion, reading, and writing.
 * The shared plan/apply diff-and-merge logic lives here.
 *
 * Scope: generators write into a base directory (project root or user home).
 * The per-scope relative config path comes from `configPaths`; the default
 * scope is "project" so existing callers keep their behavior.
 */
export abstract class BaseMcpGenerator implements McpAgentGenerator {
  abstract readonly agentType: EnvironmentCode;

  /** Relative config path per scope, "/"-separated. User path only for agents with a verified global surface. */
  protected abstract readonly configPaths: { project: string; user?: string };

  protected constructor(protected readonly scope: McpConfigScope = "project") {}

  protected resolveConfigPath(baseDir: string): string {
    const relative = this.scope === "project" ? this.configPaths.project : this.configPaths.user;
    if (!relative) {
      throw new Error(`${this.agentType} has no ${this.scope}-scope MCP config path.`);
    }
    return path.join(baseDir, ...relative.split("/"));
  }

  protected abstract toAgentFormat(def: McpServerDefinition): Record<string, unknown>;
  protected abstract readExistingServers(baseDir: string): Promise<Record<string, unknown>>;
  protected abstract writeServers(
    baseDir: string,
    mergedServers: Record<string, unknown>,
  ): Promise<void>;

  async plan(servers: Record<string, McpServerDefinition>, baseDir: string): Promise<McpMergePlan> {
    const existingServers = await this.readExistingServers(baseDir);

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
    baseDir: string,
  ): Promise<void> {
    const existingServers = await this.readExistingServers(baseDir);
    const toWrite = new Set([...plan.newServers, ...plan.resolvedConflicts]);

    for (const name of toWrite) {
      const def = servers[name];
      if (def) {
        existingServers[name] = this.toAgentFormat(def);
      }
    }

    await this.writeServers(baseDir, existingServers);
  }
}
