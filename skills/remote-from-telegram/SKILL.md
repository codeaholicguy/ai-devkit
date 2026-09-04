---
name: remote-from-telegram
description: AI DevKit · Connect the current agent session to an available Telegram channel bridge.
---

# Remote From Telegram

Use this skill when the user wants to control or chat with the current session from Telegram.

Prefer the installed `ai-devkit` binary; if unavailable, use `npx ai-devkit@latest`. Run channel and agent commands outside filesystem sandboxes because they inspect host-level agent and channel state.

## Workflow

1. Inspect channels and agents:

   ```bash
   ai-devkit channel list
   ai-devkit agent list --json
   ```

2. Identify the current agent by matching this session to an `agent list --json` entry. If unclear, ask for the agent name.

3. Find configured Telegram channels. If none exist, tell the user to run:

   ```bash
   ai-devkit channel connect telegram
   ```

   Stop after giving that action.

4. Choose a channel. Use the requested channel or the only available Telegram channel. If multiple Telegram channels are available, ask the user which one to use. Available means Telegram, enabled, authorized, and not already running.

5. If no Telegram channel is available because bridges are already running, ask before stopping one. After confirmation:

   ```bash
   ai-devkit channel stop <channel>
   ```

6. Start the bridge in the background:

   ```bash
   ai-devkit channel start <channel> --agent <agent-name> --daemon
   ```

7. Report the connected channel, agent name, and how to stop it: `ai-devkit channel stop <channel>`.

## Boundaries

- Do not create or connect a Telegram channel for the user; only point them to `channel connect`.
- Do not stop a running bridge without explicit confirmation.
- Do not guess when both agent or channel selection are ambiguous.
