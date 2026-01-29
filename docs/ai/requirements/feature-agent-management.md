---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
feature: agent-management
---

# Requirements & Problem Understanding

## Problem Statement
**What problem are we solving?**

- **Core Problem**: Developers running multiple AI coding agents (Claude Code, etc.) across different projects lack visibility into what each agent is doing, their current status, and a summary of their work.
- **Who is affected?**: Developers who use multiple AI agents in their development workflow, especially those working on multiple projects simultaneously.
- **Current situation/workaround**: 
  - Developers must manually switch between terminal windows/tabs to check each agent
  - No centralized view of all active agents
  - Difficult to track which agent is working on what task
  - No easy way to see if an agent is waiting for input or actively running

## Goals & Objectives
**What do we want to achieve?**

### Primary Goals
- Provide a unified CLI command to list all running AI agents
- Display agent type, status, and a summary of current work
- **Enable quick switching to a specific agent's terminal** with `agent open`
- Focus on Claude Code agents as the first supported agent type

### Secondary Goals
- Design an extensible architecture to support additional agent types in the future
- Enable quick identification of agents requiring user attention (e.g., waiting for input)

### Non-Goals (Out of Scope for Phase 1)
- Agent control commands (stop, pause, resume)
- Real-time dashboard/TUI mode
- Remote agent management
- Agent log viewing
- Agent configuration from the CLI

## User Stories & Use Cases
**How will users interact with the solution?**

### Primary User Stories
**As a developer**, I want to run `ai-devkit agent list` to see all my running AI agents, **so that** I can quickly understand what each agent is working on and whether any need my attention.

**As a developer**, I want to run `ai-devkit agent open <name>` to switch to a specific agent's terminal, **so that** I can quickly respond to an agent waiting for input without searching through my terminal tabs.

### Use Cases

#### UC1: List All Running Agents
**Scenario**: Developer has 3 Claude Code agents running in different terminals
**Command**: `ai-devkit agent list`
**Expected Output**:
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

#### UC2: No Agents Running
**Scenario**: Developer has no AI agents currently running
**Command**: `ai-devkit agent list`
**Expected Output**:
```
⚠ No AI agents are currently running.

  Start a Claude Code session with: claude
```

#### UC3: JSON Output for Scripting
**Scenario**: Developer wants to use agent data in scripts
**Command**: `ai-devkit agent list --json`
**Expected Output**:
```json
[
  {
    "name": "ai-devkit",
    "type": "Claude Code",
    "status": "waiting",
    "summary": "Building auth API",
    "projectPath": "/Users/dev/projects/ai-devkit",
    "lastActive": "2026-01-29T10:08:00Z"
  }
]
```

#### UC4: Open/Focus Specific Agent
**Scenario**: Developer wants to switch to an agent waiting for input
**Command**: `ai-devkit agent open ai-devkit`
**Expected Behavior**:
- Terminal focus switches to the terminal/tmux pane where `ai-devkit` agent is running
- User can immediately start typing to respond to the agent

**Success Message**:
```
🎯 Switched to agent: ai-devkit (tmux:1:3.2)
```

#### UC5: Agent Not Found
**Scenario**: Developer tries to open an agent that doesn't exist
**Command**: `ai-devkit agent open nonexistent`
**Expected Output**:
```
⚠ Agent "nonexistent" not found.

Available agents:
  • ai-devkit
  • my-website (merry)
  • test-project

Usage: ai-devkit agent open <agent-name>
```

### Edge Cases
**List Command:**
- Multiple agents in the same project directory
- Agent session files exist but process is dead (stale sessions)
- Agent running without proper debug logging enabled
- Permission issues reading Claude Code state files

**Open Command:**
- Agent running in tmux (most common for developers)
- Agent running in iTerm2 tab directly
- Agent running in Terminal.app
- Agent running in VS Code integrated terminal (may not be focusable)
- Agent running in SSH session (remote - not supported Phase 1)
- Ambiguous agent name (partial match or multiple matches)

## UX Design Decisions
**How should the interface look and feel?**

### Agent Naming Strategy
| Scenario | Name Format | Example |
|----------|-------------|----------|
| Single session per project | Project basename | `ai-devkit` |
| Multiple sessions same project | Project + truncated slug | `ai-devkit (merry)` |
| Fallback | Session slug | `merry-wobbling-starlight` |

### Status Visual Hierarchy
Statuses are designed for **< 1 second scanning** to identify agents needing attention:

| Status | Display | Color | Meaning |
|--------|---------|-------|--------|
| Waiting | 🟡 wait | Yellow | **NEEDS ATTENTION** - User input required |
| Running | 🟢 run | Green | Actively processing |
| Idle | ⚪ idle | Dim | Started but no recent activity |

### Table Columns
| Column | Description | Priority |
|--------|-------------|----------|
| **Agent** | Project-based name (+ slug if duplicate) | Must have |
| **Status** | Emoji + short status | Must have |
| **Working On** | Truncated summary (~40 chars) | Must have |
| **Active** | Relative time ("2m ago", "just now") | Must have |

### Attention Summary
When agents need attention, show a footer:
```
💡 1 agent waiting for input. Switch to its terminal to respond.
```

## Success Criteria
**How will we know when we're done?**

### Acceptance Criteria

**List Command:**
1. ✅ `ai-devkit agent list` command is available
2. ✅ `ai-devkit agent list --json` outputs valid JSON
3. ✅ Command detects running Claude Code processes
4. ✅ Command reads Claude Code's internal state files to extract session info
5. ✅ Command displays agent name, status, summary, and last active time in a table
6. ✅ Status uses emoji + color for quick visual scanning
7. ✅ Agents waiting for input are highlighted and shown first
8. ✅ Attention summary footer when agents need input
9. ✅ Command handles edge cases gracefully (no agents, stale sessions, etc.)
10. ✅ Command follows existing CLI patterns and uses `terminal-ui` utilities

**Open Command:**
11. ✅ `ai-devkit agent open <name>` command is available
12. ✅ Command switches focus to the agent's terminal (tmux, iTerm2, Terminal.app)
13. ✅ Shows helpful error message when agent not found, with list of available agents
14. ✅ Supports partial name matching when unambiguous
15. ✅ Shows warning if terminal cannot be focused (e.g., VS Code integrated terminal)

### Performance Benchmarks
- Command should complete within 500ms for up to 10 agents
- Should not consume excessive memory when parsing log files

## Constraints & Assumptions
**What limitations do we need to work within?**

### Technical Constraints
- Claude Code stores session info in `~/.claude/` directory
  - Session logs: `~/.claude/projects/{encoded-path}/{session-id}.jsonl`
  - User prompts: `~/.claude/history.jsonl`
  - Debug logs: `~/.claude/debug/{session-id}.txt`
- Process detection requires parsing `ps` output (macOS-first, Linux compatible)
- Log parsing may be fragile if Claude Code changes log format
- Session directory names use hyphens instead of path separators

### Business Constraints
- No specific time or budget constraints for Phase 1
- Feature should align with ai-devkit's vision of unified AI agent management

### Assumptions
- Users have Claude Code installed and properly configured
- Session files exist in `~/.claude/projects/` when Claude Code has been used
- Session JSONL files are readable by the current user
- Session state can be inferred from the `type` field in session entries

### Dependencies
- Existing CLI framework (Commander.js)
- Existing terminal-ui utilities
- Node.js process/child_process modules for process detection
- Node.js fs module for reading state files

## Questions & Open Items
**What do we still need to clarify?**

### Resolved Questions
- ✅ **Q: Focus on which agent type first?** A: Claude Code
- ✅ **Q: What commands to implement in Phase 1?** A: `agent list` and `agent open`
- ✅ **Q: How to detect agent status?** A: Read Claude Code internal state files

### Open Questions (Resolved)
- ✅ **Q: How to generate agent names?** 
  - **A**: Use project basename as primary name. Append truncated session slug (e.g., "merry") when multiple sessions exist for the same project.
- ✅ **Q: What defines "waiting for input" status?**
  - **A**: When the last session entry has `type: 'user'` or assistant response is complete without follow-up
- ✅ **Q: How to extract the work summary?**
  - **A**: Read `display` field from `~/.claude/history.jsonl` for the matching session ID
- ✅ **Q: Should we show terminated but recent sessions?**
  - **A**: No for Phase 1. Only show sessions with active Claude Code processes.
- ✅ **Q: What columns to display?**
  - **A**: Agent (name), Status (emoji + short), Working On (summary), Active (relative time)

### Research Completed
- ✅ Claude Code state file structure analyzed (session JSONL, history.jsonl, debug logs)
- ✅ Status detection via `type` field in session entries (`assistant`/`progress` = running, `user` = waiting, `system` = idle)
- ✅ Summary extraction from `history.jsonl` `display` field
- ✅ **Terminal focus detection researched**:
  - Get TTY from PID: `ps -p {PID} -o tty=` → e.g., "ttys030"
  - **tmux**: `tmux list-panes -a -F '#{pane_tty} #{session_name}:#{window_index}.#{pane_index}'`
  - Focus: `tmux switch-client -t {session}:{window}.{pane}`
  - **iTerm2**: AppleScript to enumerate windows/tabs/sessions and match TTY
  - **Terminal.app**: AppleScript fallback for native terminal
  - **Verified working** on macOS with tmux + iTerm2
- ✅ **POC Validated** (2026-01-29):
  - Successfully detected 2 concurrent Claude Code sessions
  - Extracted project names: "ai-devkit", "test-skills"
  - Extracted summaries from history.jsonl
  - Identified tmux pane locations (1:3.1, 1:3.2)
  - **Note**: New sessions may not have `slug` field yet - fallback to project name only
  - **Note**: Session-to-process correlation via `cwd` matching needed for accuracy
