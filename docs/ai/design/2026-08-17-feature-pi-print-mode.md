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
  Service --> Lifecycle[shared durable run lifecycle]
  Service --> Probe[PiCliProbe]
  Lifecycle --> Repository[DurableAgentRepository]
  Lifecycle --> Runner[PiPrintRunner]
  Runner --> Parser[PiStreamParser]
  Runner -->|pi --mode json --session-id/--session UUID| Pi[Pi CLI]
  Pi -->|session header + events| Runner
  Repository --> Registry[(agents.db durable_agents)]
  Registry --> Console[agent list / detail]
```

Pi follows the merged Claude and Codex durable service/runner boundary and provider-directory structure.

## Data Models

- `DurableProvider`: `claude | codex | pi`.
- `DurableAgent`: shared identity, durable mode, cwd binding, state, timestamps, active-run identity, and last result.
- `DurableAgentRepository` assigns Claude and Pi provider session UUIDs at creation, while Codex remains null until its first run; migration 004 permits the shared nullable column.

## API Design

- `PiCliProbe.validate()` runs `pi --version` and `pi --help`, requiring `--mode`, `json`, `--session-id`, and `--session`.
- `PiPrintRunner.run(request)` uses `--session-id <uuid>` for a first run and `--session <uuid>` for resume; prompt is sent on stdin.
- `onSpawn(ProcessIdentity)` persists process ownership; the emitted session UUID must match the repository-assigned UUID.
- `PiPrintAgentService.create()` probes then creates with provider `pi`.
- `PiPrintAgentService.send()` resolves, locks, checks provider, runs, records success/failure, and always releases through `completeRun`.
- The shared durable run lifecycle rejects the wrong provider before ownership acquisition and keeps successful completion writes outside the execution-failure handler.
- CLI creates and dispatches services by stored provider rather than assuming Claude.

## Component Breakdown

- `DurableAgent.ts`: provider union and Pi errors.
- `DurableAgentRepository.ts`: SQLite persistence, provider creation, and CAS run ownership.
- `durable/run.ts`: provider-neutral resolve, validation, ownership, execution, completion sequencing, summary sanitization, and session-health result mapping.
- `providers/pi/durable/PiCliProbe.ts`: sanitized capability validation.
- `providers/pi/durable/PiPrintRunner.ts`: bounded JSONL parser, identity validation, lifecycle/result extraction, subprocess safety.
- `providers/pi/durable/PiStreamParser.ts`: provider-local bounded JSONL state and final-result validation.
- `providers/pi/durable/PiPrintAgentService.ts`: orchestration and state transitions.
- `agent.ts`: start validation, provider-aware send, labels, and detail output.
- Tests mock process and store boundaries following Claude print patterns.

## Protocol Rules

- Accept exactly one valid leading/session identity event; duplicate or invalid session identity is a protocol error.
- Verify every run emits the stored UUID.
- Collect non-empty assistant text from completed assistant messages; return the last complete assistant text.
- Require clean line-delimited JSON, a zero exit code, a session identity, `agent_end`, and at least one assistant result.
- Reject oversized lines and incomplete trailing JSON; drain stderr without echoing potentially sensitive provider content.

## Design Decisions

- Selected JSON mode over plain print mode for durable session identity.
- Use Pi's `--session-id` support so the durable repository remains the UUID authority.
- Extend only the shared provider union and create input; no migration or legacy import is needed.
- Keep synchronous send behavior and SQLite CAS ownership; no daemon or streaming transport.

## Non-Functional Requirements

- Security: `shell: false`, stdin prompts, canonical non-symlink cwd, bounded JSON lines, sanitized summaries, no stderr reflection.
- Reliability: atomic SQLite mutations, provider/session uniqueness, CAS ownership, mismatch degradation, stale-run reconciliation.
- Performance: streaming JSONL parsing with a 1 MiB default line bound; no whole-output buffering.
- Compatibility: no dependencies and no behavioral changes to interactive Pi or Claude print invocations.
