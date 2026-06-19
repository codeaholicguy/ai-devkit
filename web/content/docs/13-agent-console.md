---
title: Agent Console
description: Monitor, message, start, rename, kill, and connect running AI agents from one multi-agent terminal UI.
slug: agent-console
order: 13
---

> ⚠️ **WARNING**
> This feature is currently **experimental**. It requires an interactive terminal and depends on the same local agent detection used by [Agent Management](/docs/8-agent-management).

The `agent console` command opens an interactive terminal UI for working with multiple AI agents at once. Use it when you want a multi-agent control room for monitoring active sessions, sending quick messages, starting managed agents, renaming or stopping agents, and connecting Telegram channels without switching between several terminal windows.

```bash
ai-devkit agent console
```

![Agent Console showing an agent list, preview pane, and hotkey footer](/agent-console.gif)

## Prerequisites

- **AI DevKit** installed globally (see [Getting Started](/docs/1-getting-started))
- **An interactive terminal**: `agent console` requires a TTY
- **Supported agent tools** installed for the workflows you want to use, such as Claude Code, Codex, Gemini CLI, or opencode
- **tmux** installed if you want to start or kill managed agents from the console
- **A configured Telegram channel** if you want to start remote channel bridges from the console (see [Channel](/docs/12-channel))

## What the Console Shows

The console has two main areas:

1. **Agent list**: shows detected agents, status, name, agent type, recent summary or project path, and a `remote` marker when a channel bridge is connected.
2. **Preview pane**: shows the selected agent's recent conversation, metadata, project path, and connected channel name when one is active.

On narrow terminals, the console hides the preview pane. Resize the terminal wider to show both panes.

## Hotkeys

Press `h` inside the console to show the built-in help panel.

| Key | Action |
|-----|--------|
| `j` / `Down` | Select next agent |
| `k` / `Up` | Select previous agent |
| `s` | Start a new managed agent |
| `r` | Rename the selected agent |
| `c` | Start a Telegram channel for the selected agent |
| `C` | Stop the selected agent's Telegram channel |
| `o` | Open the selected agent terminal |
| `i` / `m` | Message the selected agent |
| `K` | Kill the selected agent |
| `h` | Show or hide the help panel |
| `q` | Quit agent console |

## Common Workflows

### Monitor Running Agents

Start the console from any terminal to coordinate local multi-agent coding work:

```bash
ai-devkit agent console
```

Use `j` and `k` to move between agents. The preview pane updates as you select agents.

### Send a Message

Select an agent, press `i` or `m`, type your message, then press `Enter`.

The console sends the message to the selected agent using the same terminal control path as:

```bash
ai-devkit agent send "your message" --id <agent-name>
```

If the agent is not waiting for input, AI DevKit may still send the message, but the agent might not process it until its terminal is ready.

### Start a Managed Agent

Press `s` to open the start-agent pane. Use `Left`/`Right` or `h`/`l` to choose the agent type, `Tab` or `Down` to move between fields, `Up` to move back, `Enter` to advance or submit, and `Esc` to cancel.

Supported start types:

| Type | Agent |
|------|-------|
| `claude` | Claude Code |
| `codex` | Codex |
| `gemini_cli` | Gemini CLI |
| `opencode` | opencode |

Starting an agent from the console uses a managed tmux session. If tmux is not installed or the selected agent command is not in `PATH`, the console shows an error.

### Rename an Agent

Select an agent and press `r`. Agent names must be 2-64 characters, use lowercase letters, numbers, and hyphens, and start and end with a letter or number.

Renaming updates AI DevKit's local agent registry. It does not rename the project directory.

### Open an Agent Terminal

Select an agent and press `o` to focus its terminal window. This uses the same terminal focusing behavior as:

```bash
ai-devkit agent open <agent-name>
```

Terminal focusing works best with tmux, iTerm2, or Apple Terminal. VS Code terminal is not supported for external focus control.

### Stop an Agent

Select an agent and press `K`. Press `Enter` or `y` to confirm, or `Esc` or `n` to cancel.

Managed agents started through AI DevKit are stopped together with their tmux session.

## Channel Controls

The console can start and stop Telegram channel bridges for the selected agent.

First configure a channel:

```bash
ai-devkit channel connect telegram
```

Then open the console:

```bash
ai-devkit agent console
```

Select an agent, press `c`, choose a configured channel, then press `Enter`. The console starts the channel bridge in the background. The agent list shows `remote`, and the preview pane shows the connected channel name.

Press `C` on the selected agent to stop its running channel bridge.

If no channels are configured, the channel picker shows:

```
No channels configured. Run channel connect first.
```

For more channel setup details, see [Channel](/docs/12-channel).

## Troubleshooting

### "agent console requires an interactive terminal (TTY)"
Run `ai-devkit agent console` directly in a terminal, not from a non-interactive script or redirected command.

### "No running agents"
Start an agent in another terminal, or press `s` to start a managed agent from the console.

### Preview says "No session file available"
The selected agent has not created a readable session file yet. Send a message or wait for the agent to produce conversation output, then check the preview again.

### "No channels configured"
Run:

```bash
ai-devkit channel connect telegram
```

Then reopen the channel picker with `c`.

### Channel start fails
Check channel status and logs:

```bash
ai-devkit channel status
```

If a bridge is already running for that channel, stop it first:

```bash
ai-devkit channel stop <channel-name>
```
