---
phase: planning
title: Plan — devkitd stale restart
description: Task breakdown for #376
---

# Plan — devkitd stale restart

- [x] Failing tests: devkitd `daemon.status` identity + pid; daemon-client
  replacement matrix with fake devkitd scripts under an isolated HOME.
- [x] devkitd: `BUILD_VERSION`, `identity()`, `daemon.status` fields,
  `devkitd version`.
- [x] Release: stamp `DEVKITD_BUILD_VERSION` in `publish-devkitd.yml`,
  `rust/Cross.toml` passthrough, verify the stamp on native targets.
- [x] daemon-client: `resolveDaemonBinaryInfo`, `readBinaryBuildVersion`,
  `staleDaemonBinary` + `replaceStaleDaemon` in `ensureDaemon`.
- [x] Isolate HOME in the real-binary integration suite (it used to shut
  down whatever daemon served the user's socket).
- [x] CLI `daemon status` prints the build.
- [x] Live smoke with real binaries in an isolated HOME.
