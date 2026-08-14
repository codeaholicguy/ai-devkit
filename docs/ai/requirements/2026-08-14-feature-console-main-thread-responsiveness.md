---
phase: requirements
title: Agent Console Main-Thread Responsiveness
description: Remove repeated blocking process scans from agent-console refreshes
---

# Requirements & Problem Understanding

## Problem Statement

`AgentManager.listAgents()` invokes seven adapters in `Promise.all`, but every built-in adapter synchronously calls `listAgentProcesses()`. Gemini and Pi also inspect `node`, producing at least eight blocking `ps` scans per console refresh. The synchronous child-process calls block Ink input and rendering even though adapter promises are concurrent.

## Goals & Objectives

- Capture the relevant process data once per multi-adapter refresh.
- Run process discovery and enrichment asynchronously so the event loop remains available.
- Let adapters retain their existing process matching and session mapping behavior.
- Preserve standalone adapter calls and public compatibility where practical.
- Preserve process enrichment, partial adapter failure handling, sorting, registry behavior, and platform fallbacks.

## Non-Goals

- Changing the 3000 ms console polling interval.
- Disabling Ink `incrementalRendering`.
- Applying broad `React.memo` changes.
- Reworking session discovery or registry semantics.

## Success Criteria

- A multi-adapter `listAgents()` call performs one shared asynchronous process snapshot.
- Built-in adapter discovery no longer calls repeated synchronous process scans.
- Tests prove sharing and async boundaries using deterministic mocks rather than wall-clock thresholds.
- Agent-manager and CLI focused/full tests, lint, and builds pass.

## Constraints & Assumptions

- Existing synchronous process helpers remain exported for compatibility, but the refresh path does not use them.
- A process snapshot failure behaves like an empty process list; individual adapter failures still yield partial results.
- Linux `pwdx` fallback and Windows `.exe` matching remain supported.

## Questions & Open Items

No material open questions. The user explicitly approved the objective, constraints, validation, commit, and PR workflow.
