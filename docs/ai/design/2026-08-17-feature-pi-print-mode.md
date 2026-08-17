---
phase: design
title: Pi Print Mode Design
description: Architecture for durable Pi JSON-mode agents
---

# Pi Print Mode Design

## Architecture Overview

```mermaid
flowchart LR
  CLI[agent start/send/list/detail] --> Dispatch[provider dispatch]
  Dispatch --> Service[PiPrintAgentService]
  Service --> Probe[PiCliProbe]
  Service --> Store[PrintAgentStore v2]
  Service --> Runner[PiPrintRunner]
  Runner -->|pi --mode json [--session id]| Pi[Pi CLI]
  Pi -->|session header + events| Runner
  Runner -->|onSession UUID| Store
  Store --> Registry[(print-agents.json + run locks)]
  Registry --> Console[agent list / console]
```

Pi follows the merged Claude service/runner boundary. The open Codex design is used only as a read-only consistency reference for provider-discriminated agents and late provider-session binding.

## Data Models

- `PrintProvider`: `claude | pi` on this main-based branch.
- `PrintAgentBase`: shared AI DevKit identity, cwd binding, state, timestamps, active-run identity, and last result.
- `ClaudePrintAgent`: provider `claude`, provider session UUID assigned at creation.
- `PiPrintAgent`: provider `pi`, provider session UUID initially `null`, bound from Pi's session header during its first run.
- Store schema version 2 reads legacy version 1 Claude records and writes version 2. Non-null provider session IDs are unique per provider.

## API Design

- `PiCliProbe.validate()` runs `pi --version` and `pi --help`, requiring `--mode`, `json`, and `--session`.
- `PiPrintRunner.run(request)` spawns Pi with `['--mode', 'json']` for a first run or `['--mode', 'json', '--session', id]` for resume; prompt is sent on stdin.
- Runner callbacks: `onSpawn(ProcessIdentity)` persists process ownership; `onSession(uuid)` atomically binds/verifies provider identity.
- `PiPrintAgentService.create()` probes then creates with provider `pi`.
- `PiPrintAgentService.send()` resolves, locks, checks provider, runs, records success/failure, and always releases through `completeRun`.
- CLI creates and dispatches services by stored provider rather than assuming Claude.

## Component Breakdown

- `PrintAgent.ts`: discriminated provider types and Pi errors.
- `PrintAgentStore.ts`: schema migration, provider creation, UUID validation, unique late binding.
- `PiCliProbe.ts`: sanitized capability validation.
- `PiPrintRunner.ts`: bounded JSONL parser, identity validation, lifecycle/result extraction, subprocess safety.
- `PiPrintAgentService.ts`: orchestration and state transitions.
- `agent.ts`: start validation, provider-aware send, labels, and detail output.
- Tests mock process and store boundaries following Claude print patterns.

## Protocol Rules

- Accept exactly one valid leading/session identity event; duplicate or invalid session identity is a protocol error.
- Verify resumed runs emit the stored UUID before binding callback succeeds.
- Collect non-empty assistant text from completed assistant messages; return the last complete assistant text.
- Require clean line-delimited JSON, a zero exit code, a session identity, `agent_end`, and at least one assistant result.
- Reject oversized lines and incomplete trailing JSON; drain stderr without echoing potentially sensitive provider content.

## Design Decisions

- Selected JSON mode over plain print mode for durable session identity.
- Selected late binding because Pi owns session UUID creation.
- Generalize the shared store now, but add only Pi on main; future Codex integration can extend the union consistently.
- Keep synchronous send behavior and existing run locks; no daemon or streaming transport.
- Preserve version 1 reads and write version 2 to avoid breaking merged Claude installations.

## Non-Functional Requirements

- Security: `shell: false`, stdin prompts, canonical non-symlink cwd, bounded JSON lines, sanitized summaries, no stderr reflection.
- Reliability: atomic store mutations, provider/session uniqueness, ownership-checked binding, mismatch degradation, stale-run reconciliation.
- Performance: streaming JSONL parsing with a 1 MiB default line bound; no whole-output buffering.
- Compatibility: no dependencies and no behavioral changes to interactive Pi or Claude print invocations.
