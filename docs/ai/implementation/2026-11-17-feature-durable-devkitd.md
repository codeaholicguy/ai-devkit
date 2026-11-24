---
phase: implementation
title: Durable agents managed by devkitd
---

# Durable agents managed by devkitd

## Delivered Behavior
The daemon owns durable identities, run history, print-provider launches, minimal result parsing, stop, and reconciliation. CLI durable start/send/list/detail/session/sessions route through a typed daemon client. Three design rulings were approved before requirements or implementation.

## Components
- `devkit-core/src/store/durable.rs`: relational agent/run tables (`durable_agents`, `durable_runs`), cached `session_file_path` column (with in-place `ALTER TABLE` migration), unique active runs, immediate transactions, token guards, cwd/session validation, and wire projections (`durable_view`).
- `devkit-core/src/durable_process.rs`: TS-compatible PID/start identity, distinguishing absent/zombie processes from observation failures on both Linux (`/proc/<pid>/stat`) and macOS/BSD (`/bin/ps -o stat=,lstart=`, filtering `Z`/`X` states and working under restricted `PATH`).
- `devkit-core/src/durable_wire.rs`: Rust-generated daemon-client projections (including `sessionFilePath`).
- `devkit-harness/src/durable.rs` and `start_profiles.rs`: bounded Claude/Codex/Pi stream extraction, first/resume argv, and `resolve_durable_session_file` for O(1) cached transcript path resolution.
- `devkitd/src/durable.rs`: RPCs, independent child supervision (`supervise_child` / `classify_run_outcome`) with one-time `session_file_path` resolution on run exit and concurrent stdin feeding, startup/sweep adoption, and non-blocking identity-checked stop (releases `children` mutex before the 2s `SIGTERM` wait and waits up to 500ms after `SIGKILL` for adopted runs). Own children are finalized by waiters; vanished unsupervised runs become interrupted with unknown exit.
- CLI `DurableAgentService` (`packages/cli/src/services/agent/durable-agent.service.ts`): daemon-only durable backend with capability probe, specific-run polling, and `--debug` tracing (`ai-devkit:agent:durable`, `ai-devkit:agent:start`, `ai-devkit:agent:send` + `ensureDaemon({ onDebug })`). Mixed interactive/durable read commands (`list`, `resolve`, `sessions`) skip durable lookup when `devkitd` is unavailable or outdated so interactive commands keep working; explicit durable mutations (`create`, `send`) require a compatible `devkitd`. Session browsing canonicalizes `--cwd` filters (`realpathSync` with `path.resolve` fallback) and merges durable identities with discovered transcript metadata via indexed maps.

## Compatibility and Recovery
Exact ID wins over case-insensitive Unicode names; ambiguous names return arrays. Codex-only post-create session binding and canonical cwd safety remain enforced. Full success text is stored separately from the bounded summary, retaining foreground CLI output. Legacy `agents.db` durable rows are not migrated (users recreate durable identities via `agent start --mode durable`), avoiding dual-write bridges, import markers, and ownership fence files. The existing interactive registry bridge remains separate.

A restarted daemon monitors surviving providers by PID/start identity but cannot recover old stdout/exit status; unrecoverable completion becomes interrupted/null as approved.

## TDD and Validation Evidence
Observed red tests: absent tables/methods/RPCs; unimplemented routing/session browsing; truncated full reply; Unicode ambiguity; invalid UUID version/variant; summary control replacement/trim; corrupt-db replacement; legacy process-group stop; invalid provider type; live owner without a child; missing-agent run detail contract. Each behavior passed after its implementation/fix.

Shared Rust/TS protocol fixtures: 18 cases pass both implementations. Rust also covers chunked UTF-8 and oversized streams. CLI focused coverage run: 193 tests pass; routing module 93.1% statements, 85.36% branches, 88.23% functions. Full workspace tests, lint/clippy, formatting, root durable E2E and disposable 8-check smoke passed; final counts are in the testing artifact.

A failed spawn test exposed PATH fallback beyond the fixture command when an interpreter was missing. The daemon test PATH is now restricted to fixture executables and a Python symlink, and the suite was rerun successfully; no leftover fixture processes were found. That failed run is excluded from acceptance evidence.

## Review
Implementation matches the approved architecture. PR review and simplify passes resolved macOS process/zombie detection (`durable_process.rs`), non-blocking `stop()` lock scoping and post-`SIGKILL` wait (`devkitd/src/durable.rs`), `--debug` tracing for durable start/send/routing, `agent sessions --cwd` symlink canonicalization, and extracted `supervise_child` / `classify_run_outcome` plus cached fence checks. Security review traced same-user socket requests through argv/stdin, SQL parameters, cwd/session identity, bounded parsing and process signaling. No unresolved blocking findings. OS permission/probe failure injection and Windows execution were not performed; the fallible observation path propagates errors before destructive reconciliation. Both Linux and macOS execution are verified.

Skills loaded: dev-lifecycle, dev-worktree, memory, dev-requirements, dev-design, dev-planning, dev-implementation, tdd, verify, dev-testing, dev-simplify (analysis), dev-smoke, dev-review, security-review. Task tracing unavailable (`unknown command task`). Commit/PR skills are loaded for publication after verification; no delegated agents used.
