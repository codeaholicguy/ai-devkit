import { EnvironmentCode } from '../../../types.js';
import { ClaudeCodeMcpGenerator } from './ClaudeCodeMcpGenerator.js';

export class GitHubCopilotMcpGenerator extends ClaudeCodeMcpGenerator {
  readonly agentType: EnvironmentCode = 'github';
}
