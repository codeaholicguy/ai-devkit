---
title: Recipe — Get a Telegram or Slack ping when an agent is waiting on you
description: Run a small watcher that blocks on agent wait and sends you a messaging notification when a harness needs input.
slug: agent-wait-channel-ping-recipe
section: workflows
order: 7
---

**Get a ping on your phone when a coding agent needs input.**

Connect [Telegram or Slack](/docs/12-channel), then run a watcher in tmux that calls [`ai-devkit agent wait`](/docs/8-agent-management#wait-for-agent-changes). When an agent enters `waiting`, the loop messages you with the agent name and its current `summary` from `agent list --json`.

There is no `ai-devkit channel send` command. For one-way alerts you call the same HTTP APIs the channel bridge uses (`TelegramAdapter.sendMessage` and Slack `chat.postMessage`), with tokens from `channel connect` in `~/.ai-devkit/channels.json`. You do not need a live bridge tied to an agent terminal.

For lead/worker supervision, see [Multi-agent orchestration](/docs/17-multi-agent-orchestration) and [Recipe — Cross-vendor lead and workers](/docs/20-cross-vendor-agent-recipe).

## Prerequisites

On the machine:

- Node.js 22+ and AI DevKit installed ([Getting Started](/docs/1-getting-started))
- `tmux` so the watcher keeps running after you disconnect
- `jq` and `curl` to read channel config and call provider APIs
- At least one running interactive agent you care about ([Agent Management](/docs/8-agent-management))
- Telegram: a bot token from [@BotFather](https://t.me/BotFather), or
- Slack: a private Socket Mode app with `xapp-` and `xoxb-` tokens ([Channel — Configure a private Slack app](/docs/12-channel#configure-a-private-slack-app))

Real Telegram or Slack tokens are required for the send steps below. The CLI flags and examples match a local build; we did not run live sends in CI.

## Part 1: Connect Telegram

1. Create and connect the bot (interactive; you need a real bot token):

   ```bash
   ai-devkit channel connect telegram
   ai-devkit channel connect telegram --name personal   # optional named channel
   ```

   Tokens are stored in `~/.ai-devkit/channels.json` (mode `0600`).

2. Authorize your chat once. Telegram only sets `authorizedChatId` after you message the bot. Practical approach: start a bridge on any running agent, send the bot any message, then stop the bridge if you only want pings:

   ```bash
   ai-devkit agent list
   ai-devkit channel start personal --agent <name> --debug
   ```

   In Telegram, send a message and check the debug log for `Received message from chat ID`. Stop with `Ctrl+C` or `ai-devkit channel stop personal`.

3. Confirm authorization:

   ```bash
   ai-devkit channel list
   ```

   The Authorized column should be `yes` for that channel.

## Part 2: Connect Slack (optional)

1. Connect the app (interactive; real Slack tokens):

   ```bash
   ai-devkit channel connect slack --name work-slack
   ```

2. Capture your DM channel ID once. Slack does not store the DM channel id in `channels.json`. Start a foreground bridge with `--debug`, send the app a DM, and copy the chat id from `Received message from chat ID` (or `Connected slack conversation …`). Export it for the watcher:

   ```bash
   export SLACK_NOTIFY_CHAT_ID='D0123456789'   # your value from debug output
   ```

   Stop the bridge when you are done testing. The watcher only uses the Web API.

## Part 3: Watcher script

Save as `~/bin/agent-wait-ping.sh` (or anywhere on your `PATH`), then `chmod +x` it.

The script:

- blocks on `agent wait --until waiting --json` (default timeout 300000 ms; exits 0 on timeout so the loop continues)
- when `reason` is `triggered`, handles each change with `to: "waiting"`
- reads `summary` from `ai-devkit agent list --json`
- sends via Telegram when `NOTIFY_CHANNEL=telegram`, or Slack when `NOTIFY_CHANNEL=slack`

```bash
#!/usr/bin/env bash
set -euo pipefail

NOTIFY_CHANNEL="${NOTIFY_CHANNEL:-telegram}"
CHANNEL_NAME="${CHANNEL_NAME:-telegram}"
CONFIG="${HOME}/.ai-devkit/channels.json"

send_telegram() {
  local text="$1"
  local token chat_id
  token=$(jq -r --arg n "$CHANNEL_NAME" '.channels[$n].config.botToken // empty' "$CONFIG")
  chat_id=$(jq -r --arg n "$CHANNEL_NAME" '.channels[$n].config.authorizedChatId // empty' "$CONFIG")
  if [[ -z "$token" || -z "$chat_id" ]]; then
    echo "Telegram channel \"$CHANNEL_NAME\" needs botToken and authorizedChatId in $CONFIG" >&2
    echo "Authorize by messaging the bot while a bridge is running (see recipe)." >&2
    return 1
  fi
  curl -fsS -X POST "https://api.telegram.org/bot${token}/sendMessage" \
    -d "chat_id=${chat_id}" \
    --data-urlencode "text=${text}" >/dev/null
}

send_slack() {
  local text="$1"
  local token
  token=$(jq -r --arg n "$CHANNEL_NAME" '.channels[$n].config.botToken // empty' "$CONFIG")
  if [[ -z "$token" || -z "${SLACK_NOTIFY_CHAT_ID:-}" ]]; then
    echo "Slack needs botToken in $CONFIG and SLACK_NOTIFY_CHAT_ID in the environment" >&2
    return 1
  fi
  curl -fsS -X POST "https://slack.com/api/chat.postMessage" \
    -H "Authorization: Bearer ${token}" \
    -H "Content-type: application/json; charset=utf-8" \
    --data "$(jq -n --arg ch "$SLACK_NOTIFY_CHAT_ID" --arg t "$text" '{channel:$ch, text:$t}')" \
    | jq -e '.ok' >/dev/null
}

send_ping() {
  case "$NOTIFY_CHANNEL" in
    telegram) send_telegram "$1" ;;
    slack) send_slack "$1" ;;
    *) echo "Set NOTIFY_CHANNEL to telegram or slack" >&2; return 1 ;;
  esac
}

wait_once() {
  local result agents_json
  result=$(ai-devkit agent wait --until waiting --timeout 300000 --json)
  if [[ "$(jq -r '.reason' <<<"$result")" != "triggered" ]]; then
    return 0
  fi
  agents_json=$(ai-devkit agent list --json)
  while IFS= read -r change; do
    [[ -z "$change" ]] && continue
    local name from summary msg
    name=$(jq -r '.name' <<<"$change")
    from=$(jq -r '.from // empty' <<<"$change")
    summary=$(jq -r --arg n "$name" '.[] | select(.name == $n) | .summary // empty' <<<"$agents_json" | head -n 1)
    msg="Agent ${name} is waiting for input"
    if [[ -n "$from" ]]; then
      msg="${msg} (${from} → waiting)"
    fi
    if [[ -n "$summary" ]]; then
      msg="${msg}: ${summary}"
    fi
    send_ping "$msg"
  done < <(jq -c '.changes[] | select(.to == "waiting")' <<<"$result")
}

while true; do
  wait_once
done
```

To watch only certain agents, add repeatable `--id` flags on the `agent wait` line, for example:

```bash
result=$(ai-devkit agent wait --id api-worker --id ui-worker --until waiting --timeout 300000 --json)
```

Flags that matter here (from `ai-devkit agent wait --help`):

| Option | Role in this recipe |
|--------|---------------------|
| `--until waiting` | Ping only when input is needed (not idle/exited) |
| `--timeout 300000` | Five-minute cap; exit 0 with `reason: "timeout"` and loop again |
| `--json` | Machine-readable `changes[]` with `name`, `type`, `pid`, `from`, `to` |
| `--id <name>` | Repeatable; watch subset of agents |
| `--group <name>` | Watch a named agent group (mutually exclusive with `--id`) |

`agent wait` only reports transitions. If an agent is already waiting when the command starts, you will not get a ping until it leaves `waiting` and enters it again.

## Part 4: Run in the background (tmux)

```bash
# Telegram example (named channel "personal")
tmux new-session -d -s agent-wait-ping \
  'NOTIFY_CHANNEL=telegram CHANNEL_NAME=personal exec ~/bin/agent-wait-ping.sh'

# Slack example
tmux new-session -d -s agent-wait-ping \
  'NOTIFY_CHANNEL=slack CHANNEL_NAME=work-slack SLACK_NOTIFY_CHAT_ID=D0123456789 exec ~/bin/agent-wait-ping.sh'
```

Attach to see output:

```bash
tmux attach -t agent-wait-ping
```

Detach with `Ctrl+b` then `d`.

## Part 5: Stop the watcher

```bash
tmux kill-session -t agent-wait-ping
```

That does not remove channel configuration. Disconnect separately if you want to:

```bash
ai-devkit channel disconnect telegram
```

Any daemon bridges are separate; stop them with `ai-devkit channel stop <name>`.

## One-liner (Telegram, no script file)

Once `authorizedChatId` is set, you can run the same loop inline (needs `jq`):

```bash
while true; do
  r=$(ai-devkit agent wait --until waiting --timeout 300000 --json)
  [[ $(jq -r '.reason' <<<"$r") == triggered ]] || continue
  a=$(ai-devkit agent list --json)
  jq -c '.changes[] | select(.to=="waiting")' <<<"$r" | while read -r c; do
    n=$(jq -r '.name' <<<"$c")
    s=$(jq -r --arg n "$n" '.[]|select(.name==$n)|.summary//empty' <<<"$a"|head -1)
    f=$(jq -r '.from//empty' <<<"$c")
    t="Agent ${n} is waiting for input"
    [[ -n "$f" ]] && t="${t} (${f} → waiting)"
    [[ -n "$s" ]] && t="${t}: ${s}"
    tok=$(jq -r '.channels.telegram.config.botToken' ~/.ai-devkit/channels.json)
    cid=$(jq -r '.channels.telegram.config.authorizedChatId' ~/.ai-devkit/channels.json)
    curl -fsS -X POST "https://api.telegram.org/bot${tok}/sendMessage" \
      -d "chat_id=${cid}" --data-urlencode "text=${t}" >/dev/null
  done
done
```

If you connected Telegram with `--name personal`, change the `jq` paths accordingly.

## Common failures

| Symptom | What to check |
|--------|----------------|
| `authorizedChatId` empty / Telegram send fails | Message the bot once while a bridge is running; `channel list` should show Authorized: yes |
| Slack `not_in_channel` or `ok: false` | `SLACK_NOTIFY_CHAT_ID` must be the DM id from bridge `--debug`; bot needs `chat:write` |
| No pings but agents are waiting | `agent wait` only fires on changes. Nudge the agent or wait for the next transition |
| Loop stops when SSH disconnects | Run the script inside tmux (or screen), not a bare SSH session |
| Timeouts every 5 minutes, no ping | Normal when nothing changes (`reason: "timeout"`). The loop should keep going |
| `No agent found matching` with `--id` | Run `ai-devkit agent list --json`; use exact `name` values |

Channel setup: [Channel](/docs/12-channel). Wait semantics: [Agent Management — Wait for Agent Changes](/docs/8-agent-management#wait-for-agent-changes).

## Related

- [Channel](/docs/12-channel) — connect, bridge, and troubleshoot Telegram/Slack
- [Agent Management](/docs/8-agent-management) — `agent wait`, `agent list`, and status `summary`
- [Multi-agent orchestration](/docs/17-multi-agent-orchestration) — lead loops that call `agent wait`
- [Recipe — Cross-vendor lead and workers](/docs/20-cross-vendor-agent-recipe)