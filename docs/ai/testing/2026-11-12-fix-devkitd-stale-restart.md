---
phase: testing
title: devkitd stale restart test coverage
description: Fake-daemon replacement matrix, devkitd identity tests, live smoke with real stamped binaries
---

# Testing — devkitd stale restart

All live daemons run under `HOME=$(mktemp -d)`; the user's
`~/.ai-devkit/daemon.sock` is never touched.

## Unit / integration

- `devkitd` server tests: `daemon.status` carries `version`,
  `buildVersion` (key present, null when unstamped) and `pid`;
  `identity()` matches.
- `autostart-stale.test.ts` (fake devkitd node scripts): keep matching;
  replace older; replace pre-#376 (no `buildVersion`); replace
  `unknown method` daemon.status; keep newer; loop guard (binary reports
  another build); skip without package version; stuck daemon kept and lock
  released; three concurrent callers converge on one replacement pid.
- `integration.test.ts` real-binary suite now runs in an isolated HOME and
  asserts the new status fields.

## Manual smoke

Unstamped dev devkitd serving an isolated HOME, then `ensureDaemon` with a
`DEVKITD_BUILD_VERSION=0.2.2` build as the bundled package: old daemon
exits, new pid reports `buildVersion: 0.2.2`, `agent.list` works, and a
second call keeps the same pid.
