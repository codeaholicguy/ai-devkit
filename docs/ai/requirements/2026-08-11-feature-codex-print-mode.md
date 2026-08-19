---
phase: requirements
title: Codex Print-Mode Agents
description: Durable AI DevKit agents backed by synchronous Codex exec runs
---

# Codex Print-Mode Agents

## Problem Statement

AI DevKit supports durable Claude print agents, but Codex agents still require a continuously running interactive process. Users need a durable logical Codex identity whose messages run synchronously in short-lived `codex exec` processes while retaining one native Codex conversation.

### Terminology

- **Logical agent:** durable AI DevKit identity created by `agent start --mode print`.
- **Provider session:** Codex conversation identified by a provider-minted thread UUID.
- **Provider process:** one ephemeral `codex exec` child process.
- **Run:** one `agent send` handled by one provider process.

## Goals & Objectives

### Goals

- Add `agent start --type codex --mode print` while preserving interactive Codex as the default and Claude print behavior.
- Create the logical record without a model run or invented provider UUID.
- On first send, run `codex exec --json -`, capture `thread.started.thread_id`, and bind it atomically during the owned run.
- On later sends, run `codex exec resume --json <uuid> -` and require the emitted UUID to match.
- Reuse SQLite durable state, CAS ownership, stale recovery, canonical cwd binding, safe process identity, and bounded results.
- Pass prompts only through stdin and validate Codex capabilities without a model call.
- Keep print agents visible in human and JSON list/detail output.

### Non-goals

- Queues, retry, scheduling, cancellation, background workers, `codex exec-server`, `resume --last`, session naming, or transcript copying/deletion.
- Print-agent delete/kill semantics, Pi print mode, capacity-aware routing, or a generic provider-adapter refactor.
- Permission bypass flags, authentication/quota model calls, or changes to channels/groups/TUI.

## User Stories & Use Cases

- As a user, I can create a Codex print agent without consuming tokens; its provider session displays `not started`.
- As a user, my first synchronous send creates and durably binds the Codex thread UUID.
- As a user, later sends explicitly resume the same UUID in the immutable canonical cwd.
- As a user, I receive an immediate busy error for concurrent sends, never a queue.
- As a user, failures before binding leave the session uninitialized; failures after binding retain the UUID for safe explicit resume.
- As a user, exact IDs win and ambiguous names across interactive/print modes are rejected.

## Success Criteria

### Domain and persistence

- `DurableAgent` is a `claude | codex` discriminated union; Claude session IDs remain non-null and Codex IDs begin null.
- Records persist in migration 003's `durable_agents` table; no legacy JSON import exists for this unreleased feature.
- `bindProviderSession` requires the active run token, permits Codex null-to-UUID only, is identical-UUID idempotent, rejects replacement, and rejects duplicate non-null provider/session pairs.
- First-run binding is atomically durable before success and remains durable after a later run failure.

### Provider execution

- Probe runs only `codex --version`, `codex exec --help`, and `codex exec resume --help` and verifies `exec`, `resume`, `--json`, and stdin `-` support.
- Runner uses `shell: false`, discrete fixed argv, exact stored cwd, verified process identity, and calls `onSpawn` before sending the prompt via stdin.
- Success requires a valid matching UUID, at least one valid assistant message, `turn.completed`, clean bounded JSONL termination, and exit code zero.
- Unknown object events are ignored; malformed/non-object/oversized/truncated JSONL, missing required events, mismatch, or non-zero exit fails safely.
- Assistant texts are collected in arrival order and the final non-empty text is returned; stderr and persisted summaries are bounded and sanitized.

### CLI and compatibility

- `--mode print` accepts Claude and Codex; omitted mode remains interactive.
- Human output renders `Codex (print)` and an unbound session as `not started`; JSON derives provider from the record.
- Print sends remain synchronous and preserve exact-ID/name-resolution rules.
- Claude print, interactive Codex, and excluded commands retain existing behavior.

### Validation

- Deterministic fake-Codex unit/integration tests cover initial/resume, chunking, multiple results, process/protocol failures, binding timing, mismatch, concurrency, stale recovery, cwd, and secret safety without a real model.
- New pure/unit logic reaches 100% coverage; package and repository lint, typecheck, build, tests, coverage, and lifecycle lint pass.

## Constraints & Assumptions

- Target contract is Codex CLI 0.147.0: past-tense dotted JSONL events and provider-minted UUIDs.
- Native Codex persistence remains provider-owned; AI DevKit stores only identity, binding, state, lock/process metadata, and a bounded result summary.
- The local OS account is the authorization boundary. Codex inherits configured sandbox/approval behavior.
- A crash before processing `thread.started` may orphan a native session; recovery must never guess via `--last`.

## Questions & Open Items

No blocking questions remain. Print deletion, Pi support, capacity integration, and common-service extraction are explicit follow-ups.
