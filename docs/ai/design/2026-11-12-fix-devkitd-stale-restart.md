---
phase: design
title: devkitd stale restart design
description: buildVersion stamp in devkitd, package-version comparison in ensureDaemon, graceful replacement under the spawn lock
---

# Design — devkitd stale restart

## Identity

- `devkitd` compiles `option_env!("DEVKITD_BUILD_VERSION")` into
  `BUILD_VERSION`. `publish-devkitd.yml` exports it from
  `packages/daemon-client/package.json` (the platform packages are stamped
  with the same version), and `rust/Cross.toml` passes it into the `cross`
  container. Local cargo builds report `null`.
- `identity()` → `{version, buildVersion}` is shared by `daemon.status`
  (plus `startedAt`, `socket`, `pid`) and the new `devkitd version`
  subcommand. `buildVersion` is always present (null when unstamped), so a
  missing key identifies a pre-#376 daemon.

## Expected version

`resolveDaemonBinaryInfo()` returns `{path, source, version?}`; `version` is
the platform package's `package.json` version (ignored when `0.0.0`). Only
`source: "package"` carries one. `resolveDaemonBinary()` stays as the
path-only wrapper.

## Replacement rule (`staleDaemonBinary`)

| Live daemon | Action |
| --- | --- |
| bundled binary has no package version | keep (check skipped) |
| `buildVersion == package version` | keep |
| `buildVersion` semver-newer | keep — a newer CLI started it; downgrading would make CLIs fight over the socket |
| older / missing / `daemon.status` → `unknown method` | stale, **if** `devkitd version` of the bundled binary reports the package version; otherwise keep (loop guard) |
| `daemon.status` fails otherwise (timeout, socket error) | keep — never kill what we can't identify |

The fast path costs one inline `daemon.status` RPC; `devkitd version` is
spawned only on a mismatch.

## Replacement flow (`replaceStaleDaemon`)

1. Take the existing `daemon.sock.spawn.lock` (O_EXCL, 30s stale reclaim).
   Losers wait for the lock to disappear (≤ 2×waitMs + 1s), then connect.
2. Under the lock, reconnect and re-run the rule — a concurrent CLI may
   have replaced it already.
3. Send `shutdown` (graceful RPC; no pid signals), wait until the socket
   stops accepting connections. devkitd's `serve` unlinks the dead socket
   file itself.
4. If the daemon won't exit within `waitMs`, keep using it (daemon-first;
   never two daemons). Otherwise spawn the bundled binary and wait for the
   socket as autostart does. Release the lock.

Test runs (`VITEST` without `DEVKITD_BIN`) never replace, same as autostart.
