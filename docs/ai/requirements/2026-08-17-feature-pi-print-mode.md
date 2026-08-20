---
phase: requirements
title: Pi Print Mode Requirements
description: Durable non-interactive Pi coding agents managed by AI DevKit
---

# Pi Print Mode Requirements

## Problem Statement

AI DevKit can start Pi only as an interactive terminal process. Automation needs a durable, non-interactive Pi agent that can be registered once, addressed by AI DevKit ID or name, resumed across invocations, inspected alongside other agents, and reconciled after an interrupted run.

## Goals & Objectives

- Support `ai-devkit agent start --type pi --mode durable --name <name> --cwd <dir>`.
- Run Pi non-interactively through its structured JSON event mode.
- Persist the Pi session UUID after the first run and resume it with `--session <id>`.
- Reuse Claude print-agent identity, locking, lifecycle, listing, detail, and pruning semantics.
- Keep Claude print agents backward compatible and align storage with the Codex print-mode generalization in PR #148.
- Add no runtime dependencies.

Non-goals:

- Changing existing interactive Pi behavior.
- Streaming partial Pi output or live heartbeats to the console.
- Supporting Pi's interactive session picker (`--resume`) or forking.
- Merging or depending on the open Codex print branch.

## User Stories & Use Cases

- As an automation user, I can register a named Pi print agent without opening a terminal UI.
- As a user, I can send multiple prompts to that agent and retain Pi conversation context.
- As a user, I can see Pi print agents in `agent list` and `agent console`, and inspect their provider session ID.
- As a user, I receive a clear failure when Pi is missing, lacks required flags, emits invalid JSON, changes session identity, or exits unsuccessfully.
- As a user, an interrupted provider process is reconciled using existing print-agent run-lock behavior.

## Success Criteria

- `--type pi --mode durable` creates a persisted `provider: "pi"` agent with a repository-assigned provider session UUID.
- First send invokes `pi --mode json`, extracts and stores the session header UUID, and returns the final assistant text.
- Later sends invoke `pi --mode json --session <uuid>` and reject a different emitted UUID.
- Pi agents participate in existing list/detail/send/console flows and provider-specific dispatch.
- Claude store data remains readable and Claude tests remain green.
- New probe, protocol parsing, and argument mapping branches have 100% statement, branch, function, and line coverage.
- Agent-manager and CLI tests, typechecks/builds, and feature-doc lint pass.

## Constraints & Assumptions

- Ground truth is the installed `@earendil-works/pi-coding-agent`: `--mode json` is non-interactive, emits a leading `{type:"session", id}` JSON line, auto-saves sessions, and accepts `--session <path|id>`.
- Pi has no Claude-style caller-assigned session ID; the store must bind the provider-emitted UUID during the first run.
- Pi JSON mode emits lifecycle events rather than one terminal result object; the runner derives the result from completed assistant messages and requires `agent_end`.
- Prompts are written to stdin to avoid shell interpolation and command-line disclosure; subprocesses use `shell: false`.
- Existing print-agent storage must migrate safely without losing Claude agents.
- The globally installed lifecycle skills satisfy execution even though project-local built-in installation fails at `.agents/skills`; optional task tracing is unavailable (`unknown command 'task'`).

## Alternatives Considered

- `pi -p`: simple text output but does not expose the new session UUID reliably; rejected.
- Discover the session file after execution: races with other Pi processes and couples to filesystem layout; rejected.
- `pi --mode rpc`: designed for a long-lived controller and adds unnecessary lifecycle complexity; rejected.
- `pi --mode json --session-id <uuid>`: deterministic structured identity using the repository-assigned UUID; selected.

## Questions & Open Items

No material open items. Pi's documented session identity and resume surface resolves the durability question.
