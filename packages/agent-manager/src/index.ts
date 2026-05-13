export { AgentManager } from './AgentManager';

export { ClaudeCodeAdapter } from './adapters/ClaudeCodeAdapter';
export { CodexAdapter } from './adapters/CodexAdapter';
export { GeminiCliAdapter } from './adapters/GeminiCliAdapter';
export { OpenCodeAdapter } from './adapters/OpenCodeAdapter';
export { AgentStatus } from './adapters/AgentAdapter';
export type {
    AgentAdapter,
    AgentType,
    AgentInfo,
    ProcessInfo,
    ConversationMessage,
    SessionSummary,
    ListSessionsOptions,
} from './adapters/AgentAdapter';

export { TerminalFocusManager, TerminalType } from './terminal/TerminalFocusManager';
export type { TerminalLocation } from './terminal/TerminalFocusManager';
export { TtyWriter } from './terminal/TtyWriter';

export { getProcessTty } from './utils/process';
