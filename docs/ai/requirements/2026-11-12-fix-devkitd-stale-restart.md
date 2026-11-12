---
phase: requirements
title: Restart stale devkitd after CLI upgrades (#376)
description: Detect a running devkitd older than the CLI's bundled platform package and gracefully replace it, without restart loops or downgrading a newer daemon
---

# Requirements — devkitd stale restart

## Problem Statement

`ensureDaemon()` treats any daemon answering on `~/.ai-devkit/daemon.sock`
as authoritative. A detached daemon survives CLI upgrades indefinitely, so
daemon-side fixes (e.g. the #372 ps parser) appear ineffective until the old
process is stopped by hand. `daemon.status` only reports the Rust crate
version (`0.1.0`), which cannot distinguish platform package releases.

## Goals

- `daemon.status` reports a release identity (`buildVersion`) stamped at
  build time with the platform package version, plus `pid`.
- `ensureDaemon()` compares the live daemon against the bundled platform
  package and gracefully replaces an older one (shutdown → socket dead →
  spawn), keeping the spawn-lock/readiness behaviour.
- No restart loops: never replace when the bundled binary itself would not
  report the expected build.
- Never downgrade a newer daemon started by a newer CLI.
- `--debug` routing traces for every decision.

## Non-goals

- A `daemon restart` command (`daemon stop` + any command already does it).
- Protocol/capability negotiation beyond versions — old clients keep using
  the `unknown method` fallback from #406.
- Version checks for env-override, `~/.ai-devkit/bin`, or dev-checkout
  binaries (no package version to compare against).

## Success criteria

- An older or pre-#376 daemon is replaced on the next CLI invocation and
  `agent list` is served by the current build.
- A matching or newer daemon is left untouched (same pid).
- A packaging mismatch (package says X, binary reports Y) never triggers a
  restart.
