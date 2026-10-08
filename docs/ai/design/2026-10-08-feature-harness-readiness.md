---
phase: design
title: harness-readiness design
description: Module layout and parity notes for the I11 readiness port
---

# I11: readiness — design

## Layout

- `devkit-harness/src/readiness/mod.rs` — `Host` trait (readFile /
  access / runCommand / codexAuth — the TS injectables as a trait
  object), `ReadinessRuntime` (home, path, assetRoot, skillNames,
  skillRoots, host), `readiness_report(type)` /
  `readiness_reports()` in AGENT_TYPES order.
- `readiness/checks.rs` — shared checks + `display_home` +
  `worst_status` + `record`/`non_empty`/`accessible`.
- `readiness/profiles.rs` — the six probe-bearing profiles +
  config-dir table for all ten types.
- `readiness/codex_auth.rs` — file-based `codexAuth` equivalent
  (auth.json parse → `Option<bool>`).
- `devkit-core` — wire types (`AgentReadinessReport`, check structs)
  with ts-rs export into `daemon-client/src/gen`, matching the
  Request/Response/Event pattern.
- `devkitd` — `agent.readiness` method building `SystemHost` +
  runtime from params (home/path default to daemon env).
- `daemon-client` — `agentReadiness(params)`.
- `status.service.ts` — daemon-primary when `options` inject no fs/
  command seams; params carry homeDir/path/assetRoot/
  builtInSkillNames/skillRoots; failure → local
  `getAgentReadinessReports`.

## Parity notes

- `runCommand` semantics: `execFileAsync` resolves ONLY on exit 0 —
  spawn failure, non-zero exit, and 5s timeout all reject → every
  probe's `try { await runCommand } catch` maps to Rust `Err`.
- `resolveExecutable` splits `path` on `:` (`path.delimiter` —
  bundles stay POSIX; win32 replay skipped like harness fixtures) and
  joins with `/`; first accessible X_OK candidate wins.
- `access` mode flags map to `libc::access` `R_OK`/`X_OK` —
  identical to Node `fs.access` on unix.
- Pi `providerNames`: `provider` non-empty-string trimmed + every key
  of `providers` object + every OTHER top-level key whose value is an
  object — Set-deduped, sorted.
- OpenCode provider lines: ANSI strip, `^\s*[●*+-]\s+(.+?)\s*$`,
  trailing ` api|oauth|<word>token|<CAPS_TOKEN>` suffix removed ONCE,
  `^\d+\s+(credentials?|environment variables?)$`i excluded, dedup
  + sort.
- Pi integration `mappingStatus`: `valid || !present → pass`
  (a missing mapping is fine — tracker just never wrote), unlike the
  raw check's warn.
- Claude/codex `installed` = script AND registration pass —
  `mappingFile` contributes status but not `installed`.
- Response is an ordered `Vec<AgentReadinessReport>` (each carries
  `type`) — serde_json object maps can't preserve AGENT_TYPES key
  order without `preserve_order`; the client `fromEntries`es it, so
  `Object.keys` order is identical.
- `auth`/`integration`/`details` use `skip_serializing_if =
  Option::is_none` — absent, not `null` (matches `undefined` in
  JSON.stringify).
- `codexAuth` divergence: daemon checks auth.json file state instead
  of the capacity probe's network/RPC path. Three states preserved
  (Some(true)/Some(false)/None → pass/fail/warn); a missing
  `codex` binary no longer forces `unknown` — file creds decide.
  Documented, since the daemon must not spawn `codex app-server` for
  a status query.
- regex patterns are ported literally (the `regex` crate handles all
  of them); ANSI escape is `\x1b\[[0-?]*[ -/]*[@-~]` applied globally.

## Fixture parity

`fixtures/readiness/*.json`: `{options, files{"<dir>"}sentinel,
executables, commands{"argv joined": {stdout,stderr,ok}}, codexAuth,
expected{reports: ...}}`. TS replay wraps the same injectable seams
the unit tests use; Rust replays through a `FixtureHost`. Same oracle
pattern as the harness bundles.
