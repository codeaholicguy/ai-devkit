---
phase: design
title: System Design & Architecture
description: Define the technical architecture, components, and data models
feature: agent-management
---

# System Design & Architecture

## Architecture Overview
**What is the high-level system structure?**

```mermaid
graph TD
    CLI[CLI: agent command] --> AgentManager[AgentManager]
    AgentManager --> ProcessDetector[ProcessDetector]
    AgentManager --> ClaudeCodeAdapter[ClaudeCodeAdapter]
    
    ProcessDetector --> PS[System Processes]
    ClaudeCodeAdapter --> SessionFiles[Session JSONL Files]
    ClaudeCodeAdapter --> HistoryFile[history.jsonl]
    
    subgraph "Claude Code State (~/.claude/)"
        SessionFiles --> Projects[projects/{path}/*.jsonl]
        HistoryFile --> History[history.jsonl]
    end
    
    AgentManager --> AgentInfo[Agent Info Objects]
    AgentInfo --> TerminalUI[Terminal UI Table]
```

### Key Components

| Component | Responsibility |
|-----------|---------------|
| **AgentManager** | Orchestrates agent detection, aggregates data from multiple sources |
| **ProcessDetector** | Finds running Claude Code processes using system calls |
| **StateReader** | Reads and parses Claude Code's internal state files |
| **AgentAdapter** | Interface for supporting different agent types (extensibility) |

### Technology Stack
- **Runtime**: Node.js (matches existing CLI)
- **Process Detection**: `child_process` module for running `ps` commands
- **File Parsing**: Native `fs` module for reading JSON and text files
- **Output**: Existing `terminal-ui` module for consistent formatting

## Data Models
**What data do we need to manage?**

### Claude Code State File Structure (Discovered)
Based on system exploration, Claude Code stores state in `~/.claude/`:

```
~/.claude/
├── history.jsonl              # User input history with prompts and session IDs
├── settings.json              # User settings (model, etc.)
├── debug/
│   ├── {session-id}.txt       # Debug logs per session
│   └── latest -> ...          # Symlink to current session
└── projects/
    └── {encoded-project-path}/
        ├── sessions-index.json           # Index with original path
        └── {session-id}.jsonl            # Full conversation log
```

### Key Files for Agent Detection

#### history.jsonl
```json
{"display":"use frontend design skill to update restyle index.html","timestamp":1769677801881,"project":"/Users/.../test-skills","sessionId":"92338ceb-5a3e-4164-a3a1-246760f55129"}
```
- **display**: User's prompt (use for summary)
- **project**: Original project path
- **sessionId**: Links to session files

#### Session JSONL (`{session-id}.jsonl`)
```json
{"type":"assistant","timestamp":"2026-01-29T09:10:30.754Z","slug":"merry-wobbling-starlight","message":{...}}
{"type":"user","timestamp":"2026-01-29T09:10:24.040Z",...}
{"type":"progress","timestamp":"2026-01-29T09:10:24.041Z",...}
```
- **type**: `assistant` (running), `user` (waiting), `progress` (processing)
- **slug**: Human-readable session name (e.g., "merry-wobbling-starlight")
- **timestamp**: For determining last activity

### Core Entities

#### AgentInfo
```typescript
interface AgentInfo {
  name: string;          // Project basename (e.g., "ai-devkit") or with slug ("ai-devkit (merry)")
  type: AgentType;       // Type of agent (e.g., "Claude Code")
  status: AgentStatus;   // Current status
  statusDisplay: string; // Display format (e.g., "🟡 wait", "🟢 run")
  summary: string;       // Last user prompt from history.jsonl (truncated ~40 chars)
  pid: number;           // Process ID
  projectPath: string;   // Working directory/project path
  sessionId: string;     // Session UUID
  slug: string;          // Human-readable session name (e.g., "merry-wobbling-starlight")
  lastActive: Date;      // Timestamp of last activity
  lastActiveDisplay: string; // Relative time (e.g., "2m ago", "just now")
}

type AgentType = 'Claude Code' | 'Gemini CLI' | 'Other';

type AgentStatus = 'running' | 'waiting' | 'idle' | 'unknown';

// Status display configuration
const STATUS_CONFIG = {
  running: { emoji: '🟢', label: 'run', color: 'green' },
  waiting: { emoji: '🟡', label: 'wait', color: 'yellow' },
  idle: { emoji: '⚪', label: 'idle', color: 'dim' },
  unknown: { emoji: '❓', label: '???', color: 'gray' },
};
```

#### ClaudeCodeSession
```typescript
interface ClaudeCodeSession {
  sessionId: string;        // UUID from session filename
  projectPath: string;      // Original project path (from sessions-index.json)
  slug: string;             // Human-readable name (e.g., "merry-wobbling-starlight")
  sessionLogPath: string;   // Path to the .jsonl session file
  debugLogPath?: string;    // Path to the debug log file
  lastActivity?: Date;      // Timestamp of last log entry
  lastEntryType?: string;   // 'assistant', 'user', 'progress'
}

interface SessionEntry {
  type: 'assistant' | 'user' | 'progress' | 'summary';
  timestamp: string;
  slug: string;
  message?: {
    content?: Array<{ type: string; text?: string }>;
  };
}

interface HistoryEntry {
  display: string;          // User's prompt text
  timestamp: number;        // Unix timestamp
  project: string;          // Project path
  sessionId: string;        // Session UUID
}
```

### Data Flow
1. **Process Detection**: Query running processes (`ps aux | grep claude`) → List of PIDs + TTYs
2. **Session Discovery**: Read `~/.claude/projects/*/sessions-index.json` → List of sessions with project paths
3. **Session-Process Correlation**: 
   - Read `cwd` field from session JSONL entries
   - Match session's `cwd` to process's working directory (from `ps -o cwd=`)
   - Alternative: Match by recent debug log activity in `~/.claude/debug/{session-id}.txt`
4. **Terminal Location**: For each matched process, find terminal location:
   - Get TTY from PID: `ps -p {PID} -o tty=`
   - Query tmux: `tmux list-panes -a -F '#{pane_tty} #{session}:#{window}.#{pane}'`
   - Fallback to iTerm2/Terminal.app via AppleScript
5. **Status Extraction**: Read last entries from session JSONL → Determine status from `type` field
   - `assistant` or `progress` → running
   - `user` → waiting  
   - `system` or old timestamp → idle
6. **Summary Extraction**: Read `~/.claude/history.jsonl` → Get last user prompt for each session
7. **Agent Naming**: 
   - Use project basename (e.g., "ai-devkit")
   - If `slug` exists in session, use for disambiguation (e.g., "ai-devkit (merry)")
   - New sessions may not have `slug` yet
8. **Aggregation**: Combine all data → Sort by status (waiting first) → AgentInfo[]

## API Design
**How do components communicate?**

### Internal Interfaces

#### AgentManager
```typescript
class AgentManager {
  constructor();
  
  // List all detected agents
  async listAgents(): Promise<AgentInfo[]>;
  
  // Register an adapter for a specific agent type
  registerAdapter(adapter: AgentAdapter): void;
}
```

#### AgentAdapter (Extensibility Interface)
```typescript
interface AgentAdapter {
  type: AgentType;
  
  // Detect running agents of this type
  detectAgents(): Promise<AgentInfo[]>;
  
  // Check if this adapter can handle the given process
  canHandle(processInfo: ProcessInfo): boolean;
}
```

#### ClaudeCodeAdapter
```typescript
class ClaudeCodeAdapter implements AgentAdapter {
  type: AgentType = 'Claude Code';
  
  async detectAgents(): Promise<AgentInfo[]>;
  
  // Find running Claude Code processes
  private async findProcesses(): Promise<ProcessInfo[]>;
  
  // Read Claude Code state files
  private async readSessions(): Promise<ClaudeCodeSession[]>;
  
  // Parse debug log file
  private parseDebugLog(content: string): LogEntry[];
  
  // Determine agent status from log entries
  private determineStatus(entries: LogEntry[]): AgentStatus;
  
  // Extract work summary from log entries
  private extractSummary(entries: LogEntry[]): string;
}
```

### CLI Command Interface
```
ai-devkit agent list [options]

Options:
  --json         Output as JSON instead of table
  -h, --help     Display help

ai-devkit agent open <agent-name>

Arguments:
  agent-name     Name of agent to focus (supports partial matching)

Options:
  -h, --help     Display help
```

### TerminalFocusManager
```typescript
interface TerminalLocation {
  type: 'tmux' | 'iterm2' | 'terminal-app' | 'unknown';
  identifier: string;  // e.g., "Fosto:3.2" for tmux, window ID for iTerm2
  tty: string;         // e.g., "/dev/ttys030"
}

class TerminalFocusManager {
  // Find terminal location for a given PID
  async findTerminal(pid: number): Promise<TerminalLocation | null>;
  
  // Switch focus to the terminal
  async focusTerminal(location: TerminalLocation): Promise<boolean>;
  
  // Check tmux for matching pane
  private async findTmuxPane(tty: string): Promise<TerminalLocation | null>;
  
  // Check iTerm2 for matching session
  private async findITerm2Session(tty: string): Promise<TerminalLocation | null>;
  
  // Check Terminal.app for matching window
  private async findTerminalAppWindow(tty: string): Promise<TerminalLocation | null>;
}
```

### Focus Detection Strategy
```
1. Get TTY from agent's PID: `ps -p {PID} -o tty=`
2. Check environments in order (most likely first):
   a. tmux: `tmux list-panes -a -F '#{pane_tty} #{session_name}:#{window_index}.#{pane_index}'`
   b. iTerm2: AppleScript enumeration of windows/tabs/sessions
   c. Terminal.app: AppleScript enumeration
3. Execute focus command based on detected environment:
   - tmux: `tmux switch-client -t {session}:{window}.{pane}`
   - iTerm2: AppleScript `tell window to select`
   - Terminal.app: AppleScript `activate` + `set selected`
```

### Agent Name Matching Strategy
When user runs `agent open <name>`, resolve the target agent:

```typescript
function resolveAgentName(input: string, agents: AgentInfo[]): AgentInfo | AgentInfo[] | null {
  // 1. Exact match (case-insensitive)
  const exact = agents.find(a => a.name.toLowerCase() === input.toLowerCase());
  if (exact) return exact;
  
  // 2. Partial match (prefix or contains)
  const matches = agents.filter(a => 
    a.name.toLowerCase().includes(input.toLowerCase())
  );
  
  if (matches.length === 1) return matches[0];  // Unique partial match
  if (matches.length > 1) return matches;       // Ambiguous - return all for user choice
  return null;                                   // No match
}
```

**Resolution Table:**
| Scenario | Input | Agents | Result |
|----------|-------|--------|--------|
| Exact match | `ai-devkit` | ["ai-devkit", "my-website"] | ✅ Opens "ai-devkit" |
| Unique partial | `ai-dev` | ["ai-devkit", "my-website"] | ✅ Opens "ai-devkit" |
| Ambiguous partial | `my` | ["my-website", "my-app"] | ⚠️ Prompts: "Multiple matches found" |
| Same project, different slugs | `ai-devkit` | ["ai-devkit", "ai-devkit (merry)"] | ✅ Opens "ai-devkit" (exact) |
| Slug qualifier | `merry` | ["ai-devkit", "ai-devkit (merry)"] | ✅ Opens "ai-devkit (merry)" |
| No match | `xyz` | ["ai-devkit", "my-website"] | ❌ Shows available agents |

**Ambiguous Match Output:**
```
⚠ Multiple agents match "my":

  1. my-website (🟡 wait) - Building dashboard
  2. my-app (🟢 run) - API refactoring

Enter number to open, or use full name: ai-devkit agent open my-website
```

### Output Format

#### Table Output (Default)
```
┌─────────────────────────┬─────────┬────────────────────────────────────┬───────────┐
│ Agent                   │ Status  │ Working On                         │ Active    │
├─────────────────────────┼─────────┼────────────────────────────────────┼───────────┤
│ ai-devkit               │ 🟡 wait │ Building auth API                  │ 2m ago    │
│ my-website (merry)      │ 🟢 run  │ Restyling homepage with new...     │ just now  │
│ test-project            │ ⚪ idle │ Session started                    │ 15m ago   │
└─────────────────────────┴─────────┴────────────────────────────────────┴───────────┘

💡 1 agent waiting for input. Switch to its terminal to respond.
```

**Table Features**:
- Sort by status: waiting agents first (need attention)
- Truncate summary to ~40 characters with ellipsis
- Relative time for "Active" column
- Attention summary footer when agents need input

#### JSON Output (`--json`)
```json
[
  {
    "name": "ai-devkit",
    "type": "Claude Code",
    "status": "waiting",
    "summary": "Building auth API",
    "projectPath": "/Users/dev/projects/ai-devkit",
    "sessionId": "92338ceb-5a3e-4164-a3a1-246760f55129",
    "pid": 12345,
    "lastActive": "2026-01-29T10:08:00Z"
  }
]
```

#### Empty State
```
⚠ No AI agents are currently running.

  Start a Claude Code session with: claude
```

## Component Breakdown
**What are the major building blocks?**

### Directory Structure
```
packages/cli/src/
├── commands/
│   └── agent.ts              # CLI command registration
├── lib/
│   ├── AgentManager.ts       # Main orchestration class
│   └── adapters/
│       ├── AgentAdapter.ts   # Interface definition
│       └── ClaudeCodeAdapter.ts  # Claude Code implementation
└── util/
    └── process.ts            # Process detection utilities
```

### Component Details

#### 1. CLI Command (`commands/agent.ts`)
- Registers `agent` parent command
- Registers `agent list` subcommand
- Handles output formatting (table/JSON)
- Uses AgentManager to fetch data

#### 2. AgentManager (`lib/AgentManager.ts`)
- Maintains list of registered adapters
- Aggregates results from all adapters
- Handles errors gracefully

#### 3. ClaudeCodeAdapter (`lib/adapters/ClaudeCodeAdapter.ts`)
- Implements agent detection for Claude Code
- Reads `~/.claude/` directory structure
- Parses debug log files
- Matches processes to sessions

#### 4. Process Utilities (`util/process.ts`)
- Cross-platform process listing
- Filters by process name pattern
- Extracts PID, command, working directory

## Design Decisions
**Why did we choose this approach?**

### Decision 1: Adapter Pattern for Agent Types
**Choice**: Use an adapter pattern to support multiple agent types
**Rationale**: 
- Allows adding new agent types without modifying core code
- Each agent type has its own detection/parsing logic
- Clean separation of concerns

**Alternatives Considered**:
- Single monolithic detector (rejected: hard to extend)
- Plugin system (rejected: overkill for Phase 1)

### Decision 2: Session File Parsing
**Choice**: Parse Claude Code session JSONL files for status/summary extraction
**Rationale**:
- Session files contain structured conversation data with `type` field
- `history.jsonl` contains user prompts for summary extraction
- Both files are reliably available when Claude Code is used

**Alternatives Considered**:
- Debug log parsing (rejected: format less structured, may change)
- Process signals (rejected: no status info)
- API calls (rejected: no known API)

### Decision 3: Agent Naming Strategy
**Choice**: Use project basename as primary identifier, append truncated slug for duplicates
**Rationale**:
- Project names are meaningful to users (they know what project they're working on)
- Slugs (e.g., "merry-wobbling-starlight") provide uniqueness when needed
- Clean format: "ai-devkit" or "ai-devkit (merry)"

**Naming Logic**:
1. Extract project basename from `projectPath`
2. If multiple sessions have same project, append first word of slug
3. Fallback to full slug if no project path

**Alternatives Considered**:
- Full slug names (rejected: not intuitive, e.g., "merry-wobbling-starlight")
- PID-based names (rejected: meaningless to users)
- Sequential numbers (rejected: not persistent across restarts)

### Decision 4: Visual Status Hierarchy
**Choice**: Use emoji + short label + color for status display
**Rationale**:
- Users can identify agents needing attention in < 1 second
- Emoji works in all terminals without special font requirements
- Color adds redundancy for accessibility

**Status Hierarchy** (sorted by attention priority):
| Priority | Status | Display | Meaning |
|----------|--------|---------|--------|
| 1 | waiting | 🟡 wait | **NEEDS ATTENTION** |
| 2 | running | 🟢 run | Actively processing |
| 3 | idle | ⚪ idle | No recent activity |
| 4 | unknown | ❓ ??? | Status undetermined |

### Decision 5: Status Detection Heuristics
**Choice**: Use session JSONL `type` field to determine status
**Status Mapping**:
| Last Entry Type | Status |
|-----------------|--------|
| `assistant` or `progress` with recent timestamp | running |
| `user` or completed assistant response | waiting |
| Any type but timestamp > 5 minutes ago | idle |
| Unable to parse | unknown |

## Non-Functional Requirements
**How should the system perform?**

### Performance Targets
- **Response Time**: < 500ms for listing up to 10 agents
- **Memory Usage**: < 50MB peak during log parsing
- **Log File Limit**: Parse only last 100 lines per session

### Scalability Considerations
- Handle up to 20 concurrent agents
- Efficient file reading (streaming for large logs)
- Caching of process list during single command execution

### Security Requirements
- Read-only access to Claude Code state files
- No modification of agent state
- Respect file permissions

### Reliability/Availability
- Graceful degradation if state files are unreadable
- Handle stale sessions (process dead but files exist)
- Clear error messages for troubleshooting
