---
phase: implementation
title: Durable agents managed by devkitd
---

# Durable agents managed by devkitd

## Delivered Behavior
The daemon owns durable identities, run history, print-provider launches, minimal result parsing, stop, and reconciliation. CLI durable start/send/list/detail/session/sessions route through a typed daemon client. Three design rulings were approved before requirements or implementation.

## Components
- `devkit-core/src/store/durable.rs`: relational agent/run tables, unique active runs, immediate transactions, token guards, cwd/session validation, projections and one-time legacy snapshot import. Import marker commits with all rows; conflicts roll back and remain retryable.
- `devkit-core/src/durable_process.rs`: TS-compatible PID/start identity, distinguishing absent/zombie processes from observation failures.
- `devkit-core/src/durable_wire.rs`: Rust-generated daemon-client projections.
- `devkit-harness/src/durable.rs` and `start_profiles.rs`: bounded Claude/Codex/Pi stream extraction and first/resume argv.
- `devkitd/src/durable.rs`: RPCs, independent child supervision/stdin feeding, startup/sweep adoption, identity-checked stop, persistent ownership fence. Own children are finalized by waiters; vanished unsupervised runs become interrupted with unknown exit. Imported legacy owners remain protected while alive.
- CLI `RoutedDurableService`: capability probe before mutation, lazy compatibility service, specific-run polling, no stale fallback after transfer and no local retry of possibly executed mutations. Session browsing includes durable identities while preserving discovered transcript metadata.

## Compatibility and Recovery
Exact ID wins over case-insensitive Unicode names; ambiguous names return arrays. Codex-only post-create session binding and canonical cwd safety remain enforced. Full success text is stored separately from the bounded summary, retaining foreground CLI output. The original agents.db remains untouched by durable execution; no repeated import or dual-write bridge. The existing interactive registry bridge remains separate.

After transfer, database-open failures preserve daemon.db rather than quarantining it into an empty replacement. Stop handles legacy providers without private process groups by signaling their verified PID. A restarted daemon monitors surviving providers but cannot recover old stdout/exit status; unrecoverable completion becomes interrupted/null as approved. Concurrent older binaries writing legacy durable state and downgrade remain unsupported.

## TDD and Validation Evidence
Observed red tests: absent tables/methods/RPCs; unimplemented routing/session browsing; truncated full reply; Unicode ambiguity; invalid UUID version/variant; summary control replacement/trim; corrupt-db replacement; legacy process-group stop; invalid provider type; live owner without a child; missing-agent run detail contract. Each behavior passed after its implementation/fix.

Shared Rust/TS protocol fixtures: 18 cases pass both implementations. Rust also covers chunked UTF-8 and oversized streams. CLI focused coverage run: 193 tests pass; routing module 93.1% statements, 85.36% branches, 88.23% functions. Full workspace tests, lint/clippy, formatting, root durable E2E and disposable 8-check smoke passed; final counts are in the testing artifact.

A failed spawn test exposed PATH fallback beyond the fixture command when an interpreter was missing. The daemon test PATH is now restricted to fixture executables and a Python symlink, and the suite was rerun successfully; no leftover fixture processes were found. That failed run is excluded from acceptance evidence.

## Review
Implementation matches the approved architecture. Simplify analysis retained a single routed boundary, store owner and supervisor; no additional refactor proposed. Security review traced same-user socket requests through argv/stdin, SQL parameters, cwd/session identity, bounded parsing and process signaling. No unresolved blocking findings. OS permission/probe failure injection and cross-platform execution were not performed; the fallible observation path propagates errors before destructive reconciliation. Linux execution is verified.

Skills loaded: dev-lifecycle, dev-worktree, memory, dev-requirements, dev-design, dev-planning, dev-implementation, tdd, verify, dev-testing, dev-simplify (analysis), dev-smoke, dev-review, security-review. Task tracing unavailable (`unknown command task`). Commit/PR skills are loaded for publication after verification; no delegated agents used.
