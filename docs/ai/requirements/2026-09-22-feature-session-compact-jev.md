---
phase: requirements
title: Jev Session Compaction Requirements
description: Resume-ready historical session compaction with explicit Jev availability
---

# Jev Session Compaction Requirements

## Problem Statement

Long AI coding sessions contain operational facts that ordinary narrative summaries can lose: user constraints, decisions, changed files, commands, validation evidence, blockers, and the next action. AI DevKit can discover and read historical sessions, but users currently have to inspect the transcript and hand-write a continuation artifact.

The feature serves developers and agent harnesses handing work to another agent, resuming stale work, or preserving the useful state before context pressure becomes severe.

## Goals & Objectives

- Add a discoverable command that compacts one historical session into a concise continuation artifact.
- Use Jev as a typed decision layer to decide which normalized session messages survive, their category and importance, and whether they contain sensitive material.
- Make Jev availability explicit by checking `TYPESAFE_API_KEY` before reading or classifying the transcript.
- Produce equivalent Markdown and JSON representations for humans and automation.
- Add a built-in `session-compact` skill explaining when and how agents should call the command.

### Non-goals

- No non-Jev summarization fallback.
- No automatic memory writes, task mutation, daemon, context-pressure hook, or session mutation.
- No persistent session index, cache, or provider storage migration.
- No `--current`, `--agent`, arbitrary `--input`, or output-file option in the MVP.
- No generative model call; retained event content is organized deterministically.

## User Stories & Use Cases

- As a developer, I can run `ai-devkit agent session compact --id <session-id>` and receive a resume-ready Markdown artifact.
- As an automation author, I can pass `--format json` and receive a stable structured result.
- As a user without TypeSafe credentials, I receive an explicit Jev-unavailable result instead of a fallback or stack trace.
- As a user with multiple providers sharing a session ID, I can pass `--type` using the same resolution rules as `agent session detail`.
- As an agent, I can use the built-in skill when handing off work, nearing context limits, resuming stale work, or extracting candidate durable memories.

### Edge cases

- Unknown and ambiguous session IDs use the existing clear session-resolution errors.
- An empty normalized conversation produces an empty but valid compact result.
- A message classified as sensitive is excluded from all compact fields.
- Obvious credential patterns are locally redacted before network transmission.
- Invalid Jev responses, authentication failures, rate limits, and network failures are runtime errors and are not mislabeled as unavailable.
- The API key is never included in output, logs, error details, or Jev state.

## Success Criteria

- `ai-devkit agent session compact --help` is discoverable under the existing historical-session namespace.
- `--id <session-id>` is required; optional `--type` narrows provider resolution.
- Markdown is the default; `--format markdown|json` rejects other values.
- With no `TYPESAFE_API_KEY`, the command exits with status 0, does not read the session or call Jev, and prints exactly `Jev is unavailable because TYPESAFE_API_KEY is not set.` in Markdown mode.
- JSON unavailable output contains `{ "jev": { "available": false, "reason": "TYPESAFE_API_KEY is not set" } }`.
- With a key, each normalized message is evaluated for retention, category, importance, and sensitivity using Jev typed questions.
- Exact ID resolution uses provider-native lookup in every built-in adapter instead of constructing every historical session summary; third-party adapters remain compatible through a list-and-filter fallback.
- Jev classification runs with bounded concurrency (eight requests by default) while preserving source-message order in the artifact.
- The result contains intent, current state, decisions, changed files, commands, validation, open questions, next step, memory candidates, resume prompt, and Jev metadata.
- Markdown contains the required `# Session Compact` and section headings.
- Unit tests cover unavailable behavior, classification mapping, secret redaction/exclusion, rendering, option validation, and command wiring.
- Existing `agent sessions` and `agent session detail` tests remain green.
- A built-in `session-compact` skill documents the supported command and explicit unavailable behavior.

## Constraints & Assumptions

- Node.js 20+ and Commander conventions remain unchanged.
- Historical-session discovery and provider parsing remain owned by `@ai-devkit/agent-manager`; its adapter contract optionally supports exact-ID lookup, and the CLI then calls the selected adapter's `getConversation(..., { verbose: true })`.
- `@typesafe-ai/sdk` is the narrow Jev integration dependency. `TypeSafeClient` reads `TYPESAFE_API_KEY`; production code still performs its own presence check first.
- Jev is classification-only. A deterministic builder groups retained source content into the output schema and builds the resume prompt.
- Secret redaction is defense in depth, not a complete data-loss-prevention system; users remain responsible for the transcript they send to the hosted service.
- The unavailable result is an expected capability probe and therefore exits 0. Malformed input and runtime/API failures exit non-zero through normal CLI error handling.

## Questions & Open Items

All current decisions are resolved. Potential follow-ups are `--current`, agent-name resolution, arbitrary normalized input, `--out`, provider-native indexes for stores without ID-addressable paths, adaptive concurrency/rate-limit handling, and optional non-Jev compaction under an explicitly different mode.
