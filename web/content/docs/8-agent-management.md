---
title: Agent Management
description: Manage and interact with other AI agents running on your system
slug: agent-management
section: features
order: 3
---

The `agent` command allows AI DevKit to detect, list, and interact with other AI agents running on your system. It acts as a central hub to find where your AI coding agents are working and quickly switch context to them.

For an interactive terminal UI that combines listing, previewing, messaging, starting, renaming, killing, and channel controls, see [Agent Console](/docs/13-agent-console).

For a lead agent supervising Codex, OpenCode, or other workers, read [Multi-agent orchestration](/docs/17-multi-agent-orchestration) and [Troubleshooting: Agents & Orchestration](/docs/18-troubleshooting-agents).

## Prerequisites

### Linux session detection

For reliable `agent list`, `agent send --wait`, and session correlation on **Linux**, install **`lsof`** and ensure it is on the `PATH` of the shell and tmux server that runs your agents. Without `lsof`, AI DevKit falls back to `pwdx`; on 0.70.1 that fallback can fail to parse cwd, so sessions never match.

If `agent list` hangs with `lsof` installed, try lowering the open-file limit for that shell (for example `ulimit -n 1024`).

### Terminal focus (`agent open`)

To use the `agent open` command, your environment must meet these requirements:

- **Operating System**: macOS is currently the primary supported platform for terminal focusing. Linux detection may work, but terminal focus behavior depends on your terminal and desktop environment.
- **Terminal Emulator**: The agent must be running in one of the following:
  - **tmux**
  - **WezTerm** (the `wezterm` command must be on your `PATH`)
  - **Ghostty** (macOS)
  - **iTerm2**
  - **Apple Terminal**

> [!NOTE]
> AI DevKit uses process detection and system automation (AppleScript) to locate and focus windows. Ensure you grant necessary permissions when prompted. An agent running in tmux inside WezTerm or Ghostty is handled as tmux.

## Supported AI Tools

AI DevKit detects active sessions from the following tools:

- **[Claude Code](https://www.claude.com/product/claude-code)**: Automatically detects running `claude` processes and correlates them with your active projects.
- **[Codex](https://chatgpt.com/en-SE/features/codex)**: Detects running Codex sessions and exposes the same list, open, send, and detail workflows.
- **[Gemini CLI](https://geminicli.com/)**: Detects running Gemini CLI sessions and exposes them through the same agent management commands.
- **[GitHub Copilot](https://github.com/features/copilot)**: Detects running Copilot coding agent sessions and exposes them through the agent list, detail, and send workflows.
- **[opencode](https://opencode.ai/)**: Detects running opencode sessions and exposes them through the same agent management commands.
- **[Pi](https://pi.dev/)**: Detects Pi sessions. For more accurate Pi integration, install the [`@ai-devkit/pi-session-tracker`](https://pi.dev/packages/@ai-devkit/pi-session-tracker) package inside Pi:

  ```bash
  pi install npm:@ai-devkit/pi-session-tracker
  ```

  The tracker gives AI DevKit better session information than process detection alone.
- **[Grok CLI](https://x.ai/cli)**: Detects running `grok` sessions and exposes them through the same agent management commands.
- **[Kiro CLI](https://kiro.dev/)**: Detects Kiro CLI sessions via `~/.kiro/sessions/cli` and exposes them through the same commands.
- **[Antigravity CLI](https://antigravity.google/)**: Detects `agy` sessions and exposes them through the same commands.
- **[Devin](https://devin.ai/)**: Detects Devin CLI sessions and exposes them through the same commands.
- **[Muse Code](https://dev.meta.ai/products/muse-code/)**: Detects Muse processes and archived sessions and exposes them through the same commands.

## Commands

### Start an Agent

Start a named agent in a managed runtime session (tmux by default; set `"agentRuntime": {"provider": "herdr"}` in the global `~/.ai-devkit/.ai-devkit.json` file to use the Herdr runtime instead):

```bash
ai-devkit agent start --type claude --name backend --cwd ./packages/backend
```

`--type` accepts `claude`, `codex`, `copilot`, `gemini_cli`, `grok_cli`, `kiro`, `antigravity_cli`, `opencode`, `pi`, `devin`, or `muse`. Names default to the current folder plus a timestamp. Use `--cwd <path>` to choose a working directory and `--debug` to show startup diagnostics.

Interactive managed agents run in **tmux** (or Herdr when configured). Run `ai-devkit setup` to check the host prerequisite early; it reports the installed tmux version or prints a platform-aware install command. tmux 2.6+ is the provisional documented compatibility floor.

> [!IMPORTANT]
> **Naming and concurrent `agent list`:** On 0.70.1, if `agent list` or `agent console` runs while `agent start` is still waiting for a stable process ID, the registry can record an auto name (`{folder}-{pid}`) and your `--name` is **silently dropped** even though start reports success. While starting a worker, do not poll `agent list`; wait with `tmux has-session -t <name>` or a short `sleep`, then run the [start-then-assign](/docs/17-multi-agent-orchestration#start-then-assign-sequence-robust-on-0701) handshake. Use one [worktree or directory per agent](/docs/17-multi-agent-orchestration#layout-one-directory-per-agent) so sessions are not mixed.

The default `--mode interactive` starts the agent in an interactive session. Start output reports the runtime used (for example `Runtime: herdr`). The `durable` mode keeps a named agent available without an interactive terminal:

```bash
ai-devkit agent start --type claude --mode durable --name backend --cwd ./packages/backend
```

Durable mode supports `--type claude`, `--type codex`, and `--type pi`.

`agent start` does not accept an initial prompt or extra harness CLI arguments. To set an opening task or pass flags such as Codex approval policy or Gemini `--approval-mode`, use [Agent Console](/docs/13-agent-console) (**task** and **args** fields) or start the harness manually in tmux.

### List Agents

List all detected running agents.

```bash
ai-devkit agent list
ai-devkit agent list --json
```

**Table output includes:**

| Agent | Project | Type | Mode | Status | Working On | Active |
|-------|---------|------|------|--------|------------|--------|
| `my-project` | `my-project` | `Claude Code` | `interactive` | 🟢 run | implementing new feature | just now |
| `website-review` | `website` | `Claude Code` | `durable` | ready | not started | never |

`Project` is the final folder name from the agent's project path. `Mode` is `interactive` for terminal sessions and `durable` for print agents. Use `--json` when you want the raw machine-readable agent list.

### List Historical Sessions

List sessions that can be inspected or resumed. By default, results are limited to the current working directory and the 50 most recent sessions.

```bash
ai-devkit agent sessions
ai-devkit agent sessions --all --type codex --limit 20
ai-devkit agent sessions --cwd ./packages/cli --json
```

Use `--all` to include every working directory, `--cwd <path>` to choose one directory, `--type <type>` to filter by agent, `--limit <n>` to control the result count (`0` means no limit), and `--json` for machine-readable output.

Inspect one historical session by its ID:

```bash
ai-devkit agent session detail <session-id>
ai-devkit agent session detail <session-id> --tail 50 --verbose
```

The detail command supports `--type`, `--tail <n>`, `--full`, `--verbose`, and `--json`.

### Compact a Session

Distill a historical session into a durable continuation artifact — structured facts plus memory candidates — that you can hand to a successor agent or store for later:

```bash
ai-devkit agent session compact --id <session-id>
ai-devkit agent session compact --id <session-id> --format json
```

Find session IDs with `ai-devkit agent sessions`. Compaction is classified by Jev and requires the `TYPESAFE_API_KEY` environment variable. Use `--format markdown` (default) for a readable summary or `--format json` to splice the artifact into another agent's instructions. The built-in [`session-compact`](/docs/7-skills) skill teaches agents to run this workflow themselves at handoff points.

### Open Agent

Focus the terminal window associated with a specific agent.

```bash
ai-devkit agent open <name>
```

This command finds the exact window (tmux pane, WezTerm pane, Ghostty tab or split, iTerm2 session, etc.) where the agent is running and brings it to the foreground.

**Features:**
- **Fuzzy Matching**: `ai-devkit agent open my-proj` will match `my-project-name`.
- **Ambiguity Handling**: If multiple agents match (e.g., `web-frontend`, `web-backend`), you will be prompted to select one.

### Send Message

Send a message directly to a running agent.

```bash
ai-devkit agent send "continue with the failing tests" --id my-project
```

Useful options:

- `--stdin` to read the message from standard input (useful for piping logs or diffs)
- `--wait` to wait for and print the agent's response (use with `--id`, not `--group`)
- `--timeout <ms>` with `--wait` — maximum wait time (default **10 minutes**). Examples: `180000`, `3m`, `90s`
- `--group <name>` to send to every agent in a group (cannot combine with `--wait`, `--timeout`, or `--json`)
- `-j, --json` with `--id --wait` for machine-readable output

`--id` accepts an agent **name or partial match** (same as fuzzy matching for `agent open`). Prefer exact names from `agent list --json`; partial matches can target the wrong agent when several names share a substring.

**First message after `start`:** On 0.70.1 and earlier, `send --wait` fails with `No session file found` until the harness has handled a first message. Send a plain message first (for example `ready?`), then use `--wait`. Newer releases wait for the session file when `--wait` is set; the two-step handshake remains useful while TUIs boot. See [Troubleshooting](/docs/18-troubleshooting-agents).

If the agent is not currently waiting for input, AI DevKit warns you and still sends the message. In scripts, treat that as unsafe: messages can queue or mix, and a following `--wait` may return a reply from an earlier task. Prefer `agent detail` or an explicit handshake before `--wait`.

### Show Agent Details

Inspect a running agent's conversation details.

```bash
ai-devkit agent detail --id my-project
```

Useful options:

- `--json` for machine-readable output
- `--tail <n>` to show only the last `n` messages
- `--full` to show the entire conversation history
- `--verbose` to include tool call and tool result details

### Stop an Agent

Stop a running agent by name:

```bash
ai-devkit agent kill my-project
```

For managed agents, AI DevKit also cleans up the associated tmux session when kill succeeds against the registered process. On 0.70.1, **Codex** may register a child `codex app-server` PID; killing by auto name can fail while the tmux session keeps running. See [Troubleshooting](/docs/18-troubleshooting-agents#codex-shows-name-pid-agent-kill-impl-says-no-agents-found).

### Rename an Agent

Rename an agent in the local registry without renaming its project directory:

```bash
ai-devkit agent rename my-project backend-api
```

Names must be 2-64 characters, use lowercase letters, numbers, and hyphens, and start and end with a letter or number.

### Manage Agent Groups

Groups let you address several running agents with one send command:

```bash
ai-devkit agent group create reviewers --agent frontend --agent backend
ai-devkit agent group add reviewers security
ai-devkit agent send --group reviewers "Review the current changes"
```

Available group commands are:

- `agent group create <name> [--agent <identifier> ...]`
- `agent group update <name> [--agent <identifier> ...]`
- `agent group add <name> <identifier>`
- `agent group remove-agent <name> <identifier>`
- `agent group remove <name>`
- `agent group list`
- `agent group detail <name>`

## Known limitations

The following behaviors are known on **0.70.1** (and some persist until a future release). See [Troubleshooting: Agents & Orchestration](/docs/18-troubleshooting-agents) for fixes.

| Topic | Summary |
|-------|---------|
| `--name` race | Concurrent `agent list` during `agent start` can drop `--name` |
| Codex PID | Registry may track `app-server` child; kill/name quirks |
| Same cwd | Two agents in one directory can swap session views |
| Pi matching | Slow first reply (> ~3 min) may never match |
| Boot-time send | Messages typed before the TUI is ready can be lost |
| Busy send | `send` while not waiting still types; `--wait` can mis-associate |
| Idle Claude `running` | Status can show `running` at an idle prompt |
| `--group` + `--wait` | Not supported; use per-agent `--id --wait` |
| Partial `--id` | Substring match can hit the wrong agent |
| Stale `devkitd` | After upgrade, run `daemon stop` before trusting list output |
| Linux `pwdx` | Without `lsof`, cwd detection can fail on 0.70.1 |

## Troubleshooting

### "No running agents found"
1. Ensure the agent process (e.g., `claude`) is actually running.
2. Verify you are running AI DevKit in the same user context.

### "Could not find terminal window"
If `agent open` fails to focus the window:
1. **Check Terminal Support**: Ensure the agent is running in **tmux**, **WezTerm**, **Ghostty**, **iTerm2**, or **Apple Terminal**. VS Code terminal is strictly not supported for external focus control.
2. **Check Permissions (macOS)**:
   - Go to **System Settings** > **Privacy & Security** > **Accessibility**.
   - Ensure your terminal (iTerm2, Terminal) or tmux has permission to control your computer.
   - For Ghostty, also check **System Settings** > **Privacy & Security** > **Automation** and allow the terminal you run `ai-devkit` from to control **Ghostty**.
   - If prompted during execution, click **Allow**.
3. **WezTerm**: Run `wezterm cli list` in the same shell. If it fails, AI DevKit cannot see your WezTerm panes either.
4. **Ghostty**: Ghostty does not report which terminal owns a TTY. When several Ghostty terminals are open in the same folder, AI DevKit briefly sets a unique tab title to find the right one, then restores the original title.
