---
title: Windows via WSL2
description: Run AI DevKit on Windows using WSL2 — Node, tmux, agent CLIs, devkitd, and Linux-native paths.
slug: windows-wsl
section: start
order: 5
---

AI DevKit targets **macOS and Linux** for the full control plane: managed `agent start`, tmux, session detection, `devkitd`, and the experimental `agent console`. On **native Windows** (Node reporting `win32`), managed tmux sessions are unsupported and published installs ship **no `devkitd` binary** for Windows (only `@ai-devkit/devkitd-linux-*` and `@ai-devkit/devkitd-darwin-*` optional packages).

The supported Windows workflow is **WSL2**: install a Linux distribution, run Node and AI DevKit inside that environment, and keep repos on the **Linux filesystem** (`~/…`), not under `/mnt/c`.

## Recommended layout

| Layer | Where it runs | What lives there |
|-------|----------------|------------------|
| Windows | Host | Windows Terminal, your editor (optional), GPU drivers |
| WSL2 Linux | Ubuntu (or another distro) | Node, `ai-devkit`, tmux, `devkitd`, coding-agent CLIs |
| Project files | `~/src/…` inside WSL | Git repos, `.ai-devkit.json`, `docs/ai/` |

Do **not** rely on `npm install -g ai-devkit` in **PowerShell** alone if you want tmux-managed agents or the daemon-backed agent commands. Install the CLI and agents **inside WSL** and run commands from a WSL shell.

## 1. Install WSL2 and a distro

On Windows 11 (or Windows 10 with current updates), open **PowerShell as Administrator** and run:

```powershell
wsl --install
```

Reboot if prompted. This installs WSL2 and usually Ubuntu as the default distribution.

To list or install another distro:

```powershell
wsl --list --online
wsl --install -d Ubuntu
```

Open the distro from the Start menu or:

```powershell
wsl
```

From here on, shell examples are **inside WSL** unless noted.

## 2. Install Node.js 22+ (nvm)

AI DevKit requires **Node.js 22.0.0 or newer** (see the published `engines` field). Installing with **nvm** keeps the version aligned with tmux sessions and global npm installs.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# Restart the shell or: source ~/.bashrc  (or ~/.zshrc)

nvm install 22
nvm use 22
node -v   # should be v22.x or newer
```

Install build tools if native modules fail during `npm install -g ai-devkit`:

```bash
sudo apt-get update
sudo apt-get install -y build-essential python3
```

## 3. Install AI DevKit globally

```bash
npm install -g ai-devkit
ai-devkit setup
```

`npm install -g ai-devkit` installs the CLI only; it does **not** run `setup`. To limit which agents are configured:

```bash
ai-devkit setup --agent claude,codex,cursor
```

Supported `--agent` values (from `ai-devkit setup --help`): `codex`, `pi`, `claude`, `gemini`, `cursor`, `opencode`, `grok`, `antigravity-cli`, `kiro`, `copilot`, `devin`, `muse`.

For project bootstrap:

```bash
cd ~/src/your-project
ai-devkit init
```

An npx-only workflow works the same as on macOS/Linux; prefix every command with `npx ai-devkit@latest` (see [Getting Started](/docs/1-getting-started)).

## 4. Install tmux (required for managed agents)

Managed `agent start` uses **tmux** on Linux. Install it inside WSL:

```bash
sudo apt-get update
sudo apt-get install -y tmux
tmux -V
```

On WSL, `ai-devkit setup` and runtime error messages refer to installing tmux **inside your WSL distribution** (the CLI detects WSL from the kernel release string).

Provisional compatibility floor: tmux 2.6+; setup reports older versions but does not block on them.

## 5. Install coding-agent CLIs inside WSL

`ai-devkit setup` detects agents from **Linux home directories** under WSL (for example `~/.claude`, `~/.codex`, `~/.cursor`). A CLI installed only on Windows (for example `npm i -g` in PowerShell) is **not** on WSL's `PATH` and will not be detected.

For each agent you use:

1. Install the vendor CLI **inside WSL** (npm, vendor installer, or package manager — follow that tool's docs).
2. Launch and sign in **once** in WSL so the config directory exists.
3. Re-run `ai-devkit setup` (or `ai-devkit setup --agent <name>`).

Install [supported agents](/docs/2-supported-agents) you actually run in WSL; you do not need every agent on one machine.

## 6. Where skills and config live

All paths below are **inside the WSL Linux home** (`echo $HOME`, typically `/home/<user>`), not `C:\Users\…`.

| Item | Location |
|------|-----------|
| Global AI DevKit config | `~/.ai-devkit/.ai-devkit.json` |
| Daemon socket, DB, log | `~/.ai-devkit/daemon.sock`, `daemon.db`, `daemon.log` |
| Global built-in skills (per agent) | Agent-specific global skill dirs (for example `~/.claude/skills`, `~/.cursor/skills`) — see [Supported Agents](/docs/2-supported-agents) |
| Project config | `<repo>/.ai-devkit.json` |
| Project workflow docs | `<repo>/docs/ai/` by default |

Windows and WSL have **separate** home directories. Running `setup` in PowerShell writes Windows paths; running it in WSL writes Linux paths. Pick one environment for day-to-day agent work (WSL).

## 7. Clone and work on repos in the Linux filesystem

Prefer:

```bash
mkdir -p ~/src
cd ~/src
git clone git@github.com:you/your-repo.git
```

Avoid doing primary development under `/mnt/c/Users/...` when you can:

- **File watching** (many dev servers and tools) is slower or unreliable on DrvFs mounts.
- **Git and Node** performance is usually worse on cross-mounted Windows paths.
- **Line endings and permissions** surprises are more common on `/mnt/c`.

If you must open a repo from Windows apps, clone in WSL and access it via `\\wsl$\Ubuntu\home\<user>\src\...` rather than the reverse.

### Linux session detection in WSL

On Linux (including WSL), install **`lsof`** for reliable `agent list`, `agent send --wait`, and session correlation:

```bash
sudo apt-get install -y lsof
```

See [Agent Management — Linux session detection](/docs/8-agent-management#linux-session-detection).

## 8. Verify the setup

```bash
ai-devkit status
ai-devkit agent list
```

Optional: start a managed worker and open the console (experimental on Linux):

```bash
ai-devkit agent start --type codex
ai-devkit agent console
```

`agent console` requires a TTY (`ai-devkit agent console --help`).

### devkitd in WSL

In WSL, `devkitd` behaves like on native Linux: agent commands auto-spawn it when needed, using the bundled `@ai-devkit/devkitd-linux-*` binary when present.

```bash
ai-devkit daemon status
ai-devkit daemon logs -n 50
```

`ai-devkit daemon install` writes a **systemd --user** unit (Linux only) for persistence across reboot. WSL2 systemd support depends on your distro configuration; if user systemd is not enabled, rely on auto-spawn or run `ai-devkit daemon start` when needed. See [Runtime (devkitd)](/docs/16-runtime).

Set `DEVKITD_BIN` to override the binary path, or `AI_DEVKIT_NO_DAEMON=1` to skip auto-spawn (durable agents still need a running daemon).

## Native Windows (without WSL): known limits

These statements match the current CLI and published artifacts in this repository.

| Capability | Native Windows (`win32`) | WSL2 (Linux) |
|------------|---------------------------|--------------|
| `init`, `install`, `setup`, `skill`, `memory`, `lint`, `status` | Generally usable with Node for Windows | Supported |
| Managed `agent start` (tmux) | **Unsupported** — CLI points you to WSL + tmux | Supported with tmux |
| `agent console` | **Not supported** (documented; use macOS/Linux/WSL) | Experimental, like other Linux |
| `devkitd` auto-spawn | **No published Windows binary** — falls back when the binary is missing; some daemon-first paths degrade | Supported via `devkitd-linux-*` |
| `daemon install` (systemd) | N/A (Linux only) | Available when user systemd is configured |
| tmux install hint from CLI | "Native Windows managed interactive sessions are unsupported. Use a supported WSL distribution and install tmux inside it." | Normal Linux / WSL messaging |

You may install `ai-devkit` on Windows for **project init** or CI-style `init`/`install`, but the **agent control plane** (tmux workers, console, durable agents via `devkitd`) is intended for macOS, Linux, or **WSL2**.

## Node version and tmux

The CLI bundles native SQLite (`better-sqlite3`) for the Node version used at **`npm install -g`**. If tmux sessions use a different Node on `PATH`, memory commands can fail with `NODE_MODULE_VERSION` errors.

- Reinstall `ai-devkit` with the same Node your agents use, or
- Align tmux: `tmux set-environment -g PATH '/path/to/node/bin:…'`

See [Getting Started — Node.js and native modules](/docs/1-getting-started#nodejs-and-native-modules).

## Next steps

1. [Getting Started](/docs/1-getting-started) — full machine and project flow
2. [Agent Setup](/docs/9-agent-setup) — `init`, `install`, templates
3. [Agent Management](/docs/8-agent-management) — `agent list`, `send`, `start`
4. [Runtime (devkitd)](/docs/16-runtime) — daemon commands and troubleshooting
5. [Troubleshooting agents](/docs/18-troubleshooting-agents)