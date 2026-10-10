---
title: Runtime & Capacity
description: Check setup health with status, monitor provider quota with capacity, and manage the devkitd coordination daemon.
slug: runtime-and-capacity
order: 15
---

AI DevKit runs a local coordination daemon (`devkitd`) underneath the `agent` commands, and ships two operational commands — `status` and `capacity` — for checking setup health and provider quota before you start work.

## Status

`ai-devkit status` prints a readiness report for your whole setup:

```bash
ai-devkit status
ai-devkit status --json
```

The report covers the CLI version (and whether npm has a newer one), the project config, per-agent readiness (executable found, authentication, skills installed), tmux, skill registries, channels, and per-agent memory MCP wiring. Run it first when something feels off — it is the fastest way to tell a missing login from a missing binary.

## Capacity

`ai-devkit capacity` shows remaining quota across your logged-in providers so you can pick the agent type with the most headroom:

```bash
ai-devkit capacity
ai-devkit capacity codex claude
ai-devkit capacity --json
```

Supported providers: `codex`, `zai` (or `z.ai`), `openai`, `anthropic`, `claude`, `devin`. With no arguments, all providers are queried; pass provider names to check a subset. Output is a per-quota table with usage bars and humanized reset times; `--json` gives the raw report for scripting.

## The devkitd Daemon

Agent detection and session coordination run through `devkitd`, a small daemon written in Rust. You normally never manage it: any AI DevKit command that needs it auto-spawns it and connects over a Unix socket.

- **Socket:** `~/.ai-devkit/daemon.sock`
- **Log:** `~/.ai-devkit/daemon.log`
- **Binary:** resolved from the `DEVKITD_BIN` environment variable, the per-platform binary package that ships with the release, or a local cargo build.

### Commands

```bash
ai-devkit daemon status     # running state, socket, binary path (-j for JSON)
ai-devkit daemon start      # ensure it is running (auto-spawned anyway on use)
ai-devkit daemon stop       # stop the daemon
ai-devkit daemon logs       # tail the daemon log (-n <lines>, default 50)
ai-devkit daemon install    # install a systemd --user unit for boot persistence (Linux)
```

`daemon install` writes a `systemd --user` unit so the daemon survives logout and reboot; it is available on Linux only. To remove persistence, disable the unit with `systemctl --user` and run `ai-devkit daemon stop`.

### Troubleshooting

- **"binary not found"**: the daemon binary is resolved from `DEVKITD_BIN`, the platform package, or a cargo build — set `DEVKITD_BIN` to a valid `devkitd` binary if you run from a source checkout.
- **Stale socket**: if the daemon crashed, delete `~/.ai-devkit/daemon.sock` and let the next command respawn it.
- **Logs**: `ai-devkit daemon logs -n 200` shows recent daemon activity, including auto-spawn failures.

## Upgrading to 0.69

0.69 is the first release that distributes a platform binary and runs the daemon. On upgrade:

1. No manual step is needed — the daemon auto-spawns on the next `ai-devkit agent` command.
2. Everything lives under `~/.ai-devkit/` (`daemon.sock`, `daemon.log`); nothing is written to your project.
3. To stop it entirely, run `ai-devkit daemon stop`. To keep it running across reboots, run `ai-devkit daemon install` on Linux.

## Next Steps

- **[Agent Management](/docs/8-agent-management)**: the commands that run on top of the daemon
- **[Getting Started](/docs/1-getting-started)**: machine setup and first-run checks
