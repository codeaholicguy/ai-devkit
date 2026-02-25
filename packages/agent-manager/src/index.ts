export { AgentManager } from './AgentManager';

export { ClaudeCodeAdapter } from './adapters/ClaudeCodeAdapter';
export { AgentStatus, STATUS_CONFIG } from './adapters/AgentAdapter';
export type { AgentAdapter, AgentType, AgentInfo, ProcessInfo, StatusConfig } from './adapters/AgentAdapter';

export { TerminalFocusManager } from './terminal/TerminalFocusManager';
export type { TerminalLocation } from './terminal/TerminalFocusManager';

export { listProcesses, getProcessCwd, getProcessTty, isProcessRunning, getProcessInfo } from './utils/process';
export type { ListProcessesOptions } from './utils/process';
export { readLastLines, readJsonLines, fileExists, readJson } from './utils/file';
