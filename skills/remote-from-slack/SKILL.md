---
name: remote-from-slack
description: AI DevKit · Connect the current agent session to an available Slack channel bridge.
---

# Remote From Slack

Use this skill when the user wants to control or chat with the current session from Slack.

Prefer the installed `ai-devkit` binary; if unavailable, use `npx ai-devkit@latest`. Run AI DevKit commands outside filesystem sandboxes because they inspect host-level agent and channel state.

## Workflow

1. Check readiness:

   ```bash
   ai-devkit status --json
   ```

   If AI DevKit is not ready, use `ai-devkit-setup` skill first. Stop if setup leaves manual actions.

2. Inspect channels and agents:

   ```bash
   ai-devkit channel list
   ai-devkit agent list --json
   ```

3. Identify the current agent by matching this session to an `agent list --json` entry. If unclear, ask for the agent name.

4. Find configured Slack channels. If none exist, tell the user to run:

   ```bash
   ai-devkit channel connect slack
   ```

   Stop after giving that action.

5. Choose a channel. Use the requested channel or the only available Slack channel. If multiple Slack channels are available, ask the user which one to use. Available means Slack, enabled, credentials present, and not already running.

6. If no Slack channel is available because bridges are already running, ask before stopping one. After confirmation:

   ```bash
   ai-devkit channel stop <channel>
   ```

7. Start the bridge in the background:

   ```bash
   ai-devkit channel start <channel> --agent <agent-name> --daemon
   ```

8. Report the connected channel, agent name, and how to stop it: `ai-devkit channel stop <channel>`.

## Boundaries

- Do not create or connect a Slack channel for the user; only point them to `channel connect`.
- Do not stop a running bridge without explicit confirmation.
- Do not guess when both agent or channel selection are ambiguous.
