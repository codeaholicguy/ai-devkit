---
title: Agent Management
description: Manage and interact with other AI agents running on your system
---

# Agent Management

> [!WARNING]
> This feature is currently **experimental**, works on macOS and Linux with ai-devkit from version 0.10.0. Behaviors and commands may change in future versions.

The `agent` command allows AI DevKit to detect, list, and interact with other AI agents running on your system. It acts as a central hub to find where your AI coding assistants are working and quickly switch context to them.

## Prerequisites

To use the `agent open` command, your environment must meet these requirements:

- **Operating System**: macOS (Linux/Windows support coming soon).
- **Terminal Emulator**: The agent must be running in one of the following:
  - **tmux**
  - **iTerm2**
  - **Apple Terminal**

> [!NOTE]
> AI DevKit uses process detection and system automation (AppleScript) to locate and focus windows. Ensure you grant necessary permissions when prompted.

## Supported AI Tools

AI DevKit detects active sessions from the following tools:

- **Claude Code**: Automatically detects running `claude` processes and correlates them with your active projects.

## Commands

### List Agents

List all detected running agents.

```bash
ai-devkit agent list
```

**Output:**

| Agent | Status | Working On | Active |
|-------|--------|------------|--------|
| `my-project` | 🟢 running | implementing new feature | just now |
| `website` | ⚪ idle | fixed css bug | 10m ago |

### Open Agent

Focus the terminal window associated with a specific agent.

```bash
ai-devkit agent open <name>
```

This command finds the exact window (tmux pane, iTerm2 session, etc.) where the agent is running and brings it to the foreground.

**Features:**
- **Fuzzy Matching**: `ai-devkit agent open my-proj` will match `my-project-name`.
- **Ambiguity Handling**: If multiple agents match (e.g., `web-frontend`, `web-backend`), you will be prompted to select one.

## Troubleshooting

### "No running agents found"
1. Ensure the agent process (e.g., `claude`) is actually running.
2. Verify you are running AI DevKit in the same user context.

### "Could not find terminal window"
If `agent open` fails to focus the window:
1. **Check Terminal Support**: Ensure the agent is running in **tmux**, **iTerm2**, or **Apple Terminal**. VS Code terminal is strictly not supported for external focus control.
2. **Check Permissions (macOS)**:
   - Go to **System Settings** > **Privacy & Security** > **Accessibility**.
   - Ensure your terminal (iTerm2, Terminal) or tmux has permission to control your computer.
   - If prompted during execution, click **Allow**.
