---
phase: implementation
title: Implementation — devkitd stale restart
description: What shipped for #376
---

# Implementation — devkitd stale restart

- `rust/crates/devkitd/src/server.rs` — `BUILD_VERSION`, `identity()`;
  `daemon.status` = identity + `startedAt`/`socket`/`pid`.
- `rust/crates/devkitd/src/main.rs` — `devkitd version` / `--version`
  prints `identity()` as JSON.
- `rust/Cross.toml`, `.github/workflows/publish-devkitd.yml` — release
  stamp and a smoke check on darwin-arm64/linux-x64.
- `packages/daemon-client/src/binary.ts` — `DaemonBinary`,
  `resolveDaemonBinaryInfo`, `readBinaryBuildVersion`.
- `packages/daemon-client/src/autostart.ts` — `staleDaemonBinary` (the
  rule), `replaceStaleDaemon` (lock, shutdown, wait, spawn), shared
  `spawnDaemon`/`releaseSpawnLock`; `ensureDaemon` gains a
  `resolveBinary` test seam.
- `packages/cli/src/commands/daemon.ts` — `daemon status` prints `build:`.

Debug traces (`--debug`): `live devkitd X matches bundled package`,
`... is newer than bundled Y; keeping it`, `stale devkitd X on socket;
replacing with bundled Y`, `... not replacing` (loop guard),
`stale devkitd stopped` / `did not exit; continuing with it`.
