---
phase: planning
title: ai-devkitd task plan
description: Build order for the v1 daemon per brainstorm sequencing
---

# Planning — ai-devkitd v1

## Tasks (executed order)

1. [x] Rust workspace `rust/` + `ai-devkitd` crate skeleton (tokio, serde_json,
   rusqlite bundled, libc for SO_PEERCRED).
2. [x] Store: registry CRUD + events log + agents snapshot w/ appear/vanish diff.
3. [x] Server: unix listener, uid check, line JSON-RPC dispatch, subscribe
   (replay-then-live), discovery loop.
4. [x] `main.rs`: serve/status/install subcommands.
5. [x] `@ai-devkit/daemon-client`: client, autostart, binary resolution.
6. [x] Integrations: ChannelConfigRepository daemon-first; pi-session-tracker
   daemon-first; CLI `daemon` command.
7. [x] Gates + live smoke; single squashed commit; PR #351.
8. [x] Remediation (post-review): lifecycle docs, deeper tests (store
   concurrency, proto framing, discover fixtures, daemon-client autostart
   integration).

## Deferred (v1.5+, not in this PR)

Bridge supervision, console subscription migration, capacity cache,
task-manager store absorption, platform binary packages in release workflow,
golden-fixture corpus for the knowledge port.
