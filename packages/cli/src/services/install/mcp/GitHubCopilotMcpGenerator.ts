import { EnvironmentCode } from "../../../types.js";
import { ClaudeCodeMcpGenerator } from "./ClaudeCodeMcpGenerator.js";

export class GitHubCopilotMcpGenerator extends ClaudeCodeMcpGenerator {
  readonly agentType: EnvironmentCode = "github";

  // Project-only: Copilot MCP lives in the repo `.mcp.json`; no verified
  // user-scope path exists, so user scope intentionally throws.
  protected readonly configPaths: { project: string; user?: string } = {
    project: ".mcp.json",
  };
}
