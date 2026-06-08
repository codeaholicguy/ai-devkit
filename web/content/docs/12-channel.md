---
title: Channel
description: Connect AI agents with messaging channels like Telegram for remote interaction
slug: channel
order: 13
---

> ⚠️ **WARNING**
> This feature is currently **experimental**, works on macOS and Linux with ai-devkit from version 0.22.1. Behaviors and commands may change in future versions.

The `channel` command lets you bridge a running AI agent to a messaging platform like Telegram. Once connected, you can send prompts to your agent and receive responses directly from your messaging app — no need to be at your terminal.

## Prerequisites

- **AI DevKit** installed globally (see [Getting Started](/docs/1-getting-started))
- **A running AI agent** (Claude Code or Codex) detected by AI DevKit (see [Agent Management](/docs/8-agent-management))
- **A Telegram bot token** from [@BotFather](https://t.me/BotFather)
- **Terminal environment**: The agent must be running in **tmux**, **iTerm2**, or **Apple Terminal** (same requirements as `agent open`)

## How It Works

The channel bridge connects two sides:

1. **Input**: Messages you send to your Telegram bot are forwarded to the agent's terminal as keystrokes.
2. **Output**: New messages in the agent's conversation are polled and sent back to your Telegram chat.

The first Telegram user to message the bot is automatically authorized. All other users are rejected. This means:
- Only **one person** can control the agent per bridge session.
- If you restart the bridge, the first user to message again becomes the authorized user.
- There is no password or additional authentication — anyone who knows your bot's username can attempt to message it, but only the first user's messages are forwarded.

> **Tip**: Keep your bot username private, or use Telegram's bot settings to restrict who can find and message your bot.

## Commands

### Connect a Channel

Configure a messaging channel by providing your bot token.

```bash
ai-devkit channel connect telegram
ai-devkit channel connect telegram --name personal
```

You will be prompted to enter your Telegram bot token. AI DevKit validates the token by calling the Telegram API, then stores the configuration locally.

> **Note**: Channel configuration is stored in `~/.ai-devkit/config.json`. The bot token is saved in plaintext — do not commit this file to version control.

By default, the channel is named `telegram`. Use `--name <name>` when you want multiple Telegram bot connections, such as `personal` and `team`. Channel names must use lowercase letters, numbers, and hyphens.

If you reuse the same channel name, AI DevKit updates that channel. A Telegram bot token can only be configured for one channel name.

### List Channels

Show all configured channels and their status.

```bash
ai-devkit channel list
```

**Table output includes:**

| Name | Type | Status | Bot | Authorized | Bridge | Created |
|------|------|--------|-----|------------|--------|---------|
| `telegram` | `telegram` | enabled | `@my_bot` | yes | running | 4/21/2026 |

### Start the Bridge

Start the channel bridge between Telegram and a running agent.

```bash
ai-devkit channel start --agent <name>
ai-devkit channel start <channel-name> --agent <name>
```

**Options:**

| Option | Description |
|--------|-------------|
| `--agent <name>` | **(Required)** Name of the running agent to bridge |
| `--daemon` | Start the bridge in the background |
| `--debug` | Enable debug logging for troubleshooting |

Debug output is printed to the same terminal where the bridge is running. It includes timestamps for message polling, Telegram delivery, and terminal writes. Look for lines prefixed with `channel` to trace message flow.

If you have one Telegram channel configured, the channel name is optional. If you have multiple Telegram channels, specify which one to start.

Foreground bridges keep running in the current terminal. Press `Ctrl+C` to stop a foreground bridge.

Daemon bridges run in the background and return control to your shell. Use `channel stop` to stop a daemon bridge.

**Example:**

```bash
# Start the only configured Telegram channel in the foreground
ai-devkit channel start --agent my-project

# Start a named channel in the foreground
ai-devkit channel start personal --agent my-project

# Start a named channel in the background
ai-devkit channel start personal --agent my-project --daemon
```

```
✔ Bridge started: Telegram @my_bot <-> Agent "my-project" (PID: 12345)
ℹ Send a message to your Telegram bot to start chatting.
ℹ Press Ctrl+C to stop.
```

For daemon mode, AI DevKit prints the bridge PID and log path:

```
✔ Channel bridge daemon started for "personal" (PID: 12345).
ℹ Logs: ~/.ai-devkit/channel-logs/personal.log
ℹ Run "ai-devkit channel stop personal" to stop it.
```

### Stop the Bridge

Stop a running daemon bridge.

```bash
ai-devkit channel stop
ai-devkit channel stop <channel-name>
```

If exactly one bridge is running, the channel name is optional. If multiple bridges are running, specify the channel name.

### Show Channel Status

Display details about configured channels.

```bash
ai-devkit channel status
ai-devkit channel status <channel-name>
```

**Example output:**

```
telegram (telegram)
  Enabled: yes
  Bot: @my_bot
  Authorized: yes
  Bridge: running (PID: 12345, agent: my-project)
  Logs: ~/.ai-devkit/channel-logs/telegram.log
  Configured: 2026-04-21T10:30:00.000Z
```

> **Note**: `channel list` shows a summary table of all channels. `channel status` shows detailed configuration for each channel.

### Disconnect a Channel

Remove a channel configuration.

```bash
ai-devkit channel disconnect telegram
```

You will be asked to confirm before the configuration is removed.

## Using Channels From Agent Console

After configuring a Telegram channel, you can start and stop channel bridges from the interactive agent console. For the full console workflow, see [Agent Console](/docs/13-agent-console).

```bash
ai-devkit agent console
```

Select an agent, press `c`, choose a configured channel, then press `Enter`. The console starts the bridge in the background. Press `C` on the selected agent to stop its running channel bridge.

If no channels are configured, the console shows:

```
No channels configured. Run channel connect first.
```

## Walkthrough

Here is a step-by-step guide to set up a Telegram bridge. For full option details on each command, see [Commands](#commands) above.

1. **Create a Telegram bot**
   - Open Telegram and search for **@BotFather**
   - Send `/newbot` and follow the prompts to get a bot token
   - The token looks like `123456789:ABCdefGhIJKlmNoPQRsTUVwxyz` (a number, colon, then a hash). Copy the **entire string** including the colon.

2. **Connect the channel**
   ```bash
   ai-devkit channel connect telegram
   ```
   Paste your bot token when prompted.

3. **Start an AI agent** (if not already running)
   ```bash
   claude  # or codex
   ```
   The agent name is derived from your working directory (e.g., running `claude` in `~/code/my-project` creates an agent named `my-project`). Verify with:
   ```bash
   ai-devkit agent list
   ```

4. **Start the bridge**
   ```bash
   ai-devkit channel start --agent my-project
   ```
   To keep the bridge running in the background, use:
   ```bash
   ai-devkit channel start telegram --agent my-project --daemon
   ```

5. **Chat from Telegram**
   Open your bot in Telegram and send a message (e.g., "What files are in this project?"). You should see:
   - A typing indicator while the agent processes your message
   - The agent's response appearing as a Telegram message from your bot

   If nothing appears after 30 seconds, check the [Troubleshooting](#troubleshooting) section below.

## Troubleshooting

### "No running agents detected"
Ensure your AI agent (e.g., `claude`) is running. Use `ai-devkit agent list` to verify.

### "Cannot find terminal for agent"
The agent must be running in a supported terminal (tmux, iTerm2, or Apple Terminal). VS Code terminal is not supported for external control. See [Agent Management — Troubleshooting](/docs/8-agent-management#troubleshooting) for more details.

### "No Telegram channel configured"
Run `ai-devkit channel connect telegram` first to set up your bot token.

### Agent process exits while bridge is running
The bridge continues running but stops receiving new agent responses. You will not see an error — messages from Telegram are still sent to the terminal, but there is no agent to process them. Stop the foreground bridge with `Ctrl+C`, or stop a daemon bridge with `ai-devkit channel stop <channel-name>`, then restart after relaunching your agent.

### "Multiple Telegram channels configured"
Specify which channel to start:

```bash
ai-devkit channel start personal --agent my-project
```

### "Multiple channel bridges are running"
Specify which bridge to stop:

```bash
ai-devkit channel stop personal
```

### Messages not appearing in Telegram
- Ensure you are the first user to message the bot (only the first user is authorized).
- Check that the agent has a session file by running `ai-devkit agent detail --id <name>`.
- Use `--debug` flag when starting the bridge to see detailed logs.
