import fs from "fs-extra";
import * as path from "path";
import * as TOML from "smol-toml";
import { EnvironmentCode, McpServerDefinition } from "../../../types.js";
import { BaseMcpGenerator } from "./BaseMcpGenerator.js";
import { McpConfigScope } from "./types.js";

interface CodexConfig {
  mcp_servers?: Record<string, Record<string, unknown>>;
  [key: string]: unknown;
}

export class CodexMcpGenerator extends BaseMcpGenerator {
  readonly agentType: EnvironmentCode = "codex";

  protected readonly configPaths: { project: string; user?: string } = {
    project: ".codex/config.toml",
    // Codex global MCP config (official docs): ~/.codex/config.toml.
    user: ".codex/config.toml",
  };

  private fullConfig: CodexConfig = {};

  constructor(scope: McpConfigScope = "project") {
    super(scope);
  }

  protected toAgentFormat(def: McpServerDefinition): Record<string, unknown> {
    if (def.transport === "stdio") {
      const entry: Record<string, unknown> = { command: def.command! };
      if (def.args && def.args.length > 0) entry.args = def.args;
      if (def.env && Object.keys(def.env).length > 0) entry.env = def.env;
      return entry;
    }

    // http or sse
    const entry: Record<string, unknown> = { url: def.url! };
    if (def.headers && Object.keys(def.headers).length > 0) entry.http_headers = def.headers;
    return entry;
  }

  protected async readExistingServers(baseDir: string): Promise<Record<string, unknown>> {
    const configPath = this.resolveConfigPath(baseDir);
    if (await fs.pathExists(configPath)) {
      const content = await fs.readFile(configPath, "utf-8");
      try {
        this.fullConfig = TOML.parse(content) as CodexConfig;
      } catch (error) {
        throw new Error(
          `Invalid TOML in ${path.relative(baseDir, configPath)}: ${(error as Error).message}`,
        );
      }
      return (this.fullConfig.mcp_servers || {}) as Record<string, unknown>;
    }
    this.fullConfig = {};
    return {};
  }

  protected async writeServers(
    baseDir: string,
    mergedServers: Record<string, unknown>,
  ): Promise<void> {
    const configPath = this.resolveConfigPath(baseDir);
    await fs.ensureDir(path.dirname(configPath));

    // The user's global ~/.codex/config.toml routinely carries comments and
    // hand-tuned formatting. A TOML round-trip would destroy them, so the
    // user scope writes textually: append or replace only our own table.
    if (this.scope === "user") {
      const original = (await fs.pathExists(configPath))
        ? await fs.readFile(configPath, "utf-8")
        : "";
      const output = upsertTomlTable(original, "mcp_servers", mergedServers);
      try {
        TOML.parse(output);
      } catch {
        throw new Error(
          `Refusing to write ${path.relative(baseDir, configPath)}: upsert would produce invalid TOML (check for a conflicting inline [mcp_servers] entry).`,
        );
      }
      await fs.writeFile(configPath, output, "utf-8");
      return;
    }

    const output = { ...this.fullConfig, mcp_servers: mergedServers };
    await fs.writeFile(configPath, TOML.stringify(output), "utf-8");
  }
}

/**
 * Textually upsert `[<table>.<name>]` TOML tables for every entry in
 * `servers`, leaving all other bytes of `content` untouched.
 *
 * - Missing table → appended at the end.
 * - Existing table (header line through the line before the next `[` header
 *   or EOF) → replaced in place.
 */
export function upsertTomlTable(
  content: string,
  table: string,
  servers: Record<string, unknown>,
): string {
  let output = content;
  for (const [name, entry] of Object.entries(servers)) {
    const body = entryToTomlBody(entry as Record<string, unknown>);
    output = replaceTomlTable(output, `${table}.${name}`, body);
  }
  return output;
}

function entryToTomlBody(entry: Record<string, unknown>): string {
  return Object.entries(entry)
    .map(([key, value]) => `${key} = ${tomlValue(value)}`)
    .join("\n");
}

function tomlValue(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(tomlValue).join(", ")}]`;
  return TOML.stringify(value as never).trim();
}

function replaceTomlTable(content: string, tablePath: string, body: string): string {
  const headerPattern = new RegExp(`^\\s*\\[${escapeRegExp(tablePath)}\\]\\s*$`, "m");
  const match = content.match(headerPattern);

  if (!match) {
    const prefix = content.length === 0 || content.endsWith("\n") ? content : `${content}\n`;
    const separator = prefix.endsWith("\n\n") || prefix === "" ? "" : "\n";
    return `${prefix}${separator}[${tablePath}]\n${body}\n`;
  }

  const start = match.index!;
  const after = content.slice(start + match[0].length);
  // Table body runs until the next header line or EOF.
  const nextHeader = after.match(/^\s*\[/m);
  const bodyEnd = nextHeader ? nextHeader.index! : after.length;
  const blockBody = after.slice(0, bodyEnd);
  const blockAfter = after.slice(bodyEnd);

  const keptAfter =
    blockAfter.startsWith("\n") || blockAfter === "" ? blockAfter : `\n${blockAfter}`;
  return `${content.slice(0, start)}[${tablePath}]\n${body}\n${keptAfter}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
