---
title: Runtime (devkitd)
description: How the devkitd coordination daemon works, how it auto-starts, and the daemon commands for status, logs, and persistence.
slug: runtime
order: 16
---

Agent detection and session coordination run through `devkitd`, a small daemon written in Rust. You normally never manage it: any AI DevKit command that needs it auto-spawns it and connects over a Unix socket.

- **Socket:** `~/.ai-devkit/daemon.sock`
- **Log:** `~/.ai-devkit/daemon.log`
- **Binary:** resolved from the `DEVKITD_BIN` environment variable, the per-platform binary package that ships with the release, or a local cargo build.

## Commands

```bash
ai-devkit daemon status     # running state, socket, binary path (-j for JSON)
ai-devkit daemon start      # ensure it is running (auto-spawned anyway on use)
ai-devkit daemon stop       # stop the daemon
ai-devkit daemon logs       # tail the daemon log (-n <lines>, default 50)
ai-devkit daemon install    # install a systemd --user unit for boot persistence (Linux)
```

`daemon install` writes a `systemd --user` unit so the daemon survives logout and reboot; it is available on Linux only. To remove persistence, disable the unit with `systemctl --user` and run `ai-devkit daemon stop`.

## Troubleshooting

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
- **[Status & Capacity](/docs/15-capacity)**: operational checks for setup health and provider quota
