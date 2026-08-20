---
phase: design
title: Codex Print-Mode Agent Design
description: Provider-minted session binding and run-per-message Codex execution
---

# Codex Print-Mode Agent Design

## Architecture Overview

Codex is added beside the existing Claude provider modules, sharing only the proven durable store/state primitives.

```mermaid
flowchart LR
  CLI[agent start/list/detail/send] --> Resolver[provider-aware print resolver]
  Resolver --> Claude[ClaudePrintAgentService]
  Resolver --> Codex[CodexPrintAgentService]
  Claude --> Repository[DurableAgentRepository]
  Codex --> Repository
  Codex --> Runner[CodexPrintRunner]
  Runner -->|prompt via stdin| Exec[codex exec process]
  Exec -->|JSONL thread/turn/item events| Runner
  Runner -->|bind thread UUID during run| Repository
  Exec --> Native[(Codex native session)]
```

Interactive adapters remain unchanged. No generic provider framework or persistent server is introduced.

## Data Models

```ts
type DurableProvider = 'claude' | 'codex';
type DurableAgent = ClaudeDurableAgent | CodexDurableAgent;

interface DurableAgentBase {
  id: string;
  name: string;
  mode: 'durable';
  cwd: string;
  state: 'ready' | 'running' | 'degraded';
  sessionHealth: 'uninitialized' | 'healthy' | 'unknown' | 'mismatch';
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
  lastResult: PrintLastResult | null;
  activeRun: PrintActiveRun | null;
}

interface ClaudeDurableAgent extends DurableAgentBase {
  provider: 'claude';
  providerSessionId: string;
}

interface CodexDurableAgent extends DurableAgentBase {
  provider: 'codex';
  providerSessionId: string | null;
}
```

Migration 003 stores flattened records in SQLite's `durable_agents` table. The provider column is application-validated; nullable unique session IDs allow unbound Codex creation without a follow-up migration. No legacy JSON import exists.

## API Design

```ts
create(input: { name: string; cwd: string; provider?: DurableProvider }): Promise<DurableAgent>;
bindProviderSession(agentId: string, runToken: string, providerSessionId: string): Promise<DurableAgent>;

interface CodexPrintRunRequest {
  agent: CodexDurableAgent;
  prompt: string;
  executable?: string;
  onSpawn(identity: ProcessIdentity): Promise<void>;
  onSession(providerSessionId: string): Promise<void>;
}
```

`bindProviderSession` runs in `BEGIN IMMEDIATE`, verifies active-token ownership and UUID validity, permits only Codex null-to-value or same-value idempotence, relies on SQLite uniqueness, and uses a conditional update on `active_run_token`.

Initial argv is `exec --json -`; resume argv is `exec resume --json UUID -`. The prompt never enters argv.

## Component Breakdown

- `DurableAgent`: shared base and provider discriminants with canonical `AGENT_MODES.DURABLE`.
- `DurableAgentRepository`: provider-aware SQLite creation, uniqueness, CAS binding, and upstream reconciliation.
- `CodexCliProbe`: non-model version/help capability checks.
- `CodexPrintRunner`: safe spawn, process handshake, bounded JSONL parser, immediate session callback, assistant-result extraction.
- `CodexPrintAgentService`: resolve → acquire → run → bind → complete, with provider-specific health classification.
- CLI: selects service by requested/persisted provider and renders provider-specific labels/session state.
- `fake-codex.cjs`: deterministic executable contract and failure controls.

## Design Decisions

- Parallel Codex modules minimize Claude regression risk; shared-service extraction waits for another provider or demonstrated need.
- `thread.started.thread_id` is authoritative because initial and resumed 0.147.0 runs emit the same UUID.
- Binding occurs immediately during the owned first run so post-binding failure resumes instead of forking.
- Explicit UUID resume is mandatory; `--last`, names, transcript scanning, and `exec-server` are rejected.
- Unknown object events are forward-compatible, while required identity/result/completion events remain strict.

## Non-Functional Requirements

- Atomic per-agent exclusion prevents concurrent turns on one Codex thread.
- Stdout lines, stderr capture, and persisted summaries are bounded; malformed streams fail closed.
- Spawn uses no shell and no permission-bypass flags; prompt and native transcripts are never persisted.
- Creation/probe are non-billable and sends have no implicit retry.
- Existing schema records and interactive/Claude behavior remain compatible.
