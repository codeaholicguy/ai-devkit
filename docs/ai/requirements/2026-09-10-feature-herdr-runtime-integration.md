---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

## Problem Statement

AI DevKit currently treats managed interactive agents as tmux-backed sessions. Herdr can own richer terminal/session behavior, but AI DevKit should continue to own its existing workflow state, memory, skills, channels, assignments, validation evidence, and agent registry metadata.

The integration should let users configure Herdr as the single active managed-agent runtime without adding per-command runtime flags or duplicating Herdr's terminal/session inventory into AI DevKit.

Affected users:

- AI DevKit users who want Herdr to manage terminal panes, PTYs, focus/open behavior, and agent lifecycle detection.
- Users who still expect tmux to remain the default when no runtime config exists.
- Future automation and channel users who depend on stable `agent start`, `agent send`, and `agent send --wait` semantics.

Current workaround:

- Use AI DevKit's tmux-backed managed agents, or manually run agents inside Herdr without AI DevKit runtime awareness.

## Goals & Objectives

Goals:

- Keep tmux as the default runtime.
- Add runtime selection from global `~/.ai-devkit/.ai-devkit.json`, not project `.ai-devkit.json` and not per command.
- Support exactly `tmux` and `herdr` providers for MVP.
- Resolve missing config, missing `agentRuntime`, or missing `agentRuntime.provider` to `tmux`.
- Fail early on unknown providers with the valid values.
- Let Herdr own terminal sessions, panes, PTYs, process IO, focus/open behavior, and agent lifecycle detection.
- Let AI DevKit remain owner of task state, memory, skills, channels, assignments, validation evidence, agent names, and agent registry records.
- Store Herdr runtime references in the existing agent DB record.
- Preserve compatibility with old tmux-backed records.
- Support Herdr availability checks, managed start, prompt send, send-and-wait, output/result read, and focus/open for human intervention.

Non-goals for MVP:

- No `--runtime` command flag.
- No per-agent or per-command mixed runtime selection.
- No project-level runtime selection.
- No full Herdr session list/detail mirroring into AI DevKit.
- No separate Herdr agent database.
- No guessing Herdr pane/session IDs.
- No socket API dependency for MVP; CLI/API command integration is acceptable first.
- Active code should stop using `tmuxSession`; tmux session identity lives in `runtime_ref` as `{ "session": "<name>" }`.
- No removal of the existing physical `tmux_session` column in the initial migration; keep it only for legacy row backfill and compatibility.

## User Stories & Use Cases

- As an AI DevKit user with no runtime config, I want managed agents to keep using tmux so existing workflows continue unchanged.
- As an AI DevKit user, I want to set `{ "agentRuntime": { "provider": "herdr" } }` once in global config so managed-agent commands use Herdr consistently.
- As a user running `ai-devkit agent start` outside Herdr, I want AI DevKit to use Herdr when configured if the Herdr binary and backend are available.
- As a user running inside Herdr, I want AI DevKit to use `HERDR_ENV` and `HERDR_PANE_ID` as context signals when available.
- As an automation user, I want `agent send --wait` to continue returning agent output/result without needing to know whether tmux or Herdr backs the session.
- As a human operator, I want AI DevKit to focus/open the Herdr agent pane when intervention is required.
- As a maintainer, I want old registry rows without runtime metadata to behave as tmux records.

Edge cases:

- Runtime config changes from tmux to Herdr while old tmux records still exist.
- Herdr provider is configured but the `herdr` command is missing.
- Herdr provider is configured but the Herdr backend/API is unreachable.
- `HERDR_ENV=1` exists but `HERDR_PANE_ID` is missing.
- Herdr returns no process PID, stale process PID, or a PID that later exits.
- Herdr pane/session ref is stale or malformed.
- `runtime_ref` JSON in the DB is malformed.
- A group send targets a mix of legacy tmux records and Herdr records even though MVP has one configured active backend.
- A Herdr pane is renamed independently from AI DevKit's agent name.

## Success Criteria

- Global config parsing accepts `agentRuntime.provider` values `tmux` and `herdr`.
- Global config parsing defaults to `tmux` when config, `agentRuntime`, or `provider` is missing.
- Global config parsing rejects unknown providers with an error that lists `tmux` and `herdr`.
- `agent start` keeps current tmux behavior by default.
- `agent start` uses Herdr when global runtime provider is `herdr`.
- Herdr start records the opaque Herdr reference returned by Herdr.
- AI DevKit never fabricates Herdr pane/session IDs.
- Existing rows without runtime metadata are read as tmux-backed records.
- `tmux_session` remains supported only as a legacy database backfill source while new runtime metadata is added.
- `agent send`, `agent send --wait`, output/read behavior, and focus/open dispatch through the selected/stored runtime.
- AI DevKit detail/list surfaces AI DevKit-owned metadata and does not attempt to mirror full Herdr session details.
- Unit tests cover config resolution, registry migration/defaults, runtime dispatch, Herdr availability failures, and Herdr reference persistence.

## Constraints & Assumptions

- Runtime selection is global and read from `~/.ai-devkit/.ai-devkit.json`.
- Project `.ai-devkit.json` does not configure `agentRuntime`.
- Supported MVP providers are `tmux` and `herdr`.
- Missing runtime metadata on old records means `tmux`.
- The existing `agents` table remains the registry for interactive managed agents.
- The initial schema change is additive: add `runtime` and `runtime_ref`; keep `tmux_session` as a legacy physical column.
- Herdr CLI/API should provide structured output for reliable parsing.
- Herdr availability for `runtime = herdr` requires the Herdr binary and reachable backend/API.
- `HERDR_ENV` and `HERDR_PANE_ID` are context signals, not hard requirements for starting Herdr-backed agents.
- Initial implementation can shell out to Herdr CLI/API; later implementation may use a socket API for lower latency/events.
- AI DevKit's existing adapter transcript parsing remains the source of output/result interpretation where provider session files exist.

## Questions & Open Items

- Confirm exact Herdr CLI/API commands and JSON response schema for start, send, send-and-wait/read-output, focus/open, stop, and snapshot.
- Decide whether Herdr start can always return a process PID. If not, update registry identity assumptions before implementation.
- Decide exact user-facing behavior when a stored agent runtime differs from current global runtime config.
- Decide whether `agent kill` for Herdr should terminate only the agent process, close the pane, or delegate fully to Herdr's stop lifecycle.
