---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
feature: agent-management
---

# Implementation Guide

## Development Setup
**How do we get started?**

### Prerequisites
- Node.js 18+ installed
- Claude Code installed and functional
- ai-devkit repository cloned and dependencies installed

### Environment Setup
```bash
# Navigate to CLI package
cd packages/cli

# Install dependencies
npm install

# Run tests to verify setup
npm test

# Build the package
npm run build
```

### Configuration
No special configuration needed. The feature reads from:
- Claude Code state files at `~/.claude/`
- System processes via `ps` command

## Code Structure
**How is the code organized?**

### Directory Structure
```
packages/cli/src/
├── commands/
│   ├── agent.ts              # NEW: Agent command registration
│   ├── init.ts
│   ├── memory.ts
│   ├── phase.ts
│   ├── setup.ts
│   └── skill.ts
├── lib/
│   ├── AgentManager.ts       # NEW: Agent orchestration
│   ├── adapters/             # NEW: Agent adapters directory
│   │   ├── AgentAdapter.ts   # NEW: Interface definition
│   │   └── ClaudeCodeAdapter.ts  # NEW: Claude Code implementation
│   ├── Config.ts
│   ├── SkillManager.ts
│   └── TemplateManager.ts
└── util/
    ├── process.ts            # NEW: Process utilities
    ├── git.ts
    └── terminal-ui.ts
```

### Naming Conventions
- **Files**: kebab-case for utilities, PascalCase for classes
- **Classes**: PascalCase (e.g., `AgentManager`, `ClaudeCodeAdapter`)
- **Interfaces**: PascalCase with `I` prefix optional (e.g., `AgentAdapter`)
- **Types**: PascalCase (e.g., `AgentInfo`, `AgentStatus`)
- **Functions**: camelCase (e.g., `listProcesses`, `parseDebugLog`)

## Implementation Notes
**Key technical details to remember:**

### Core Features

#### Process Detection
```typescript
// util/process.ts
import { execSync } from 'child_process';

export interface ProcessInfo {
  pid: number;
  command: string;
  cwd?: string;
}

export function listProcesses(pattern: RegExp): ProcessInfo[] {
  // Use ps command with appropriate flags
  // macOS: ps -eo pid,command
  // Parse output and filter by pattern
}
```

#### Debug Log Parsing
```typescript
// Example log entry format from Claude Code:
// 2026-01-29T09:05:10.698Z [DEBUG] Some message here

const LOG_ENTRY_REGEX = /^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)\s+\[(\w+)\]\s+(.+)$/;

interface LogEntry {
  timestamp: Date;
  level: string;
  message: string;
}

function parseLogEntry(line: string): LogEntry | null {
  const match = line.match(LOG_ENTRY_REGEX);
  if (!match) return null;
  return {
    timestamp: new Date(match[1]),
    level: match[2],
    message: match[3],
  };
}
```

#### Status Detection Heuristics
Based on research of Claude Code debug logs:

| Pattern | Indicates Status |
|---------|-----------------|
| `[render]` entries with recent timestamp | running |
| `Writing to temp file` | running |
| `Waiting for` in message | waiting for input |
| No entries in last 30 seconds | idle |
| Cannot correlate to process | unknown |

### Patterns & Best Practices

#### Error Handling Pattern
```typescript
// Follow existing pattern from SkillManager
try {
  const agents = await agentManager.listAgents();
  // Display results
} catch (error: any) {
  ui.error(`Failed to list agents: ${error.message}`);
  process.exit(1);
}
```

#### Terminal UI Usage
```typescript
import { ui } from '../util/terminal-ui';

// Table output
ui.table({
  headers: ['Name', 'Type', 'Status', 'Summary'],
  rows: agents.map(agent => [
    agent.name,
    agent.type,
    agent.status,
    agent.summary
  ]),
  columnStyles: [chalk.cyan, chalk.dim, statusColor, chalk.white]
});

// Status messages
ui.warning('No AI agents are currently running.');
ui.info('Start an agent with: claude');
```

## Integration Points
**How do pieces connect?**

### AgentManager ↔ Adapters
```typescript
// AgentManager registers and uses adapters
const manager = new AgentManager();
manager.registerAdapter(new ClaudeCodeAdapter());
const agents = await manager.listAgents();
```

### ClaudeCodeAdapter ↔ File System
```typescript
// Read from ~/.claude/ directory
const homeDir = os.homedir();
const claudeDir = path.join(homeDir, '.claude');
const debugDir = path.join(claudeDir, 'debug');

// List debug log files
const files = await fs.readdir(debugDir);
const logFiles = files.filter(f => f.endsWith('.txt'));
```

### ClaudeCodeAdapter ↔ Process Utilities
```typescript
// Find Claude Code processes
const processes = listProcesses(/claude/i);

// Match process to session
const session = sessions.find(s => s.pid === process.pid);
```

## Error Handling
**How do we handle failures?**

### Error Categories

| Category | Example | Handling |
|----------|---------|----------|
| File not found | ~/.claude/ doesn't exist | Return empty array, show info message |
| Permission denied | Can't read debug logs | Log warning, skip affected sessions |
| Parse error | Invalid log format | Skip affected entry, continue parsing |
| Process detection fails | `ps` command fails | Throw error with helpful message |

### Error Messages
```typescript
// Use ui.error for user-facing errors
ui.error('Failed to list agents: Cannot access Claude Code state directory');

// Provide actionable guidance
ui.info('Make sure Claude Code is installed and has been run at least once.');
```

## Performance Considerations
**How do we keep it fast?**

### Log File Reading
```typescript
// Read only the last N lines for large files
const TAIL_LINES = 100;

async function readTailLines(filePath: string, lines: number): Promise<string[]> {
  // Use streaming or efficient file reading
  // Avoid loading entire file into memory
}
```

### Process Caching
```typescript
// Cache process list during single command execution
let processCache: ProcessInfo[] | null = null;

function getProcesses(): ProcessInfo[] {
  if (!processCache) {
    processCache = listProcesses(/claude/i);
  }
  return processCache;
}
```

### Parallel Operations
```typescript
// Read multiple log files in parallel
const sessions = await Promise.all(
  logFiles.map(file => readSession(file))
);
```

## Security Notes
**What security measures are in place?**

### File Access
- Only read from Claude Code state directories
- Never write or modify any files
- Respect file system permissions

### Process Access
- Read-only process listing
- No signals sent to processes
- No IPC or control capabilities

### Data Handling
- No sensitive data stored
- No network requests
- No credentials accessed
