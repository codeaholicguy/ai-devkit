---
phase: requirements
title: "OMP Agent Harness Support - Requirements"
feature: omp-adapter
description: Requirements for managing oh-my-pi (OMP) sessions and structured profile launches in AI DevKit
---

# Requirements: OMP Agent Harness Support

## Problem Statement

AI DevKit can manage Pi-compatible agents, but oh-my-pi (OMP) is a separate executable with a different session root and Bun-launched process shape. OMP profile aliases such as `omp-work='omp --profile work'` are also not reliable launch identities inside non-interactive Tmux or daemon shells.

## Goals

- Detect and manage OMP interactive processes through the same agent-manager surface as other harnesses.
- Discover OMP JSONL sessions from the default root, named profile roots, XDG data roots, and supported `PI_CONFIG_DIR`/`PI_CODING_AGENT_DIR` overrides.
- Support profile launches as structured executable arguments, without evaluating shell aliases.
- Keep TypeScript local discovery and Rust `devkitd` discovery behavior aligned.
- Preserve existing Pi behavior and public APIs except for additive OMP/type support.

## Non-goals

- Executing arbitrary shell aliases or shell command strings.
- OMP durable/print-mode support in this change.
- OMP protocol changes or modifying the OMP package.
- A general third-party vendor plugin registry.

## User Stories

- As a user, I can list running OMP sessions with `agent list`.
- As a user, I can inspect OMP conversation history and historical sessions.
- As a user, I can send a prompt, wait for completion, focus, and stop an OMP agent.
- As a user, I can start a profile using `agent start --type omp --arg --profile --arg work` or the console's structured arguments field.
- As a user, OMP agents remain visible when `devkitd` is authoritative.

## Acceptance Criteria

1. `AgentType` and all exhaustive built-in type tables include `omp`.
2. OMP matching accepts the OMP CLI/Bun process shape and rejects unrelated Bun/Node processes.
3. OMP sessions are read only below one of the resolved OMP session roots; malformed records do not fail discovery.
4. OMP summaries, status, conversation detail, and historical listing work for the installed session format.
5. Local and daemon discovery produce the same OMP agent type and session mapping.
6. Structured arguments reach both local Tmux and daemon Tmux launches without shell alias evaluation.
7. Tests cover positive/negative process matching, session mapping, argument propagation, and Rust/TypeScript parity.
8. Existing supported harness behavior remains unchanged.

- OMP is Bun-launched, so matching must identify the OMP CLI path rather than every Bun process.
- OMP resolves sessions under `~/.omp/agent/sessions`, named profile roots, `$XDG_DATA_HOME/omp/sessions` and profile roots, or `PI_CODING_AGENT_DIR/sessions`; `PI_CONFIG_DIR` changes the home-relative config root.
- OMP project buckets use home-relative names such as `-repo`; paths outside home use the upstream absolute form such as `--srv-app--`.
- Tmux receives a shell command string; arguments must be quoted deterministically.
- The daemon's authoritative result means Rust support is required, not optional.
