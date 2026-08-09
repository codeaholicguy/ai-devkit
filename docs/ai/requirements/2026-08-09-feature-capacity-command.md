---
phase: requirements
title: Capacity Command Requirements
description: Define truthful, read-only provider capacity reporting before agent dispatch
---

# Capacity Command Requirements

## Problem Statement

AI DevKit can start agents backed by Codex, Claude, Pi, and other providers, but previously could not inspect provider capacity before launch. Humans and orchestrators discovered limits only after starting work, sometimes after a task was already in progress. The workaround was to check provider-specific interfaces manually or launch an agent and react to a rate-limit failure.

The `capacity` command gives human operators, the agent-management workflow, parent agents, and future schedulers one factual report before dispatch.

## Goals

- Provide one fast, read-only command for provider capacity and authentication state.
- Emit stable schema-versioned JSON for automation and a readable human table.
- Show only configured providers by default, detected from provider configuration directories.
- Preserve every authoritative provider window instead of forcing daily/weekly fields.
- Distinguish configured, installed, and authenticated states.
- Treat missing or unsupported capacity as `unknown`, never as positive availability.
- Allow partial provider failures without losing the complete report.
- Report available reset-credit counts without redeeming credits.
- Avoid model inference, prompts, TUI interaction, and model-quota consumption.

## Non-Goals

- Automatic provider selection or changes to `agent start`.
- Forecasting, task-cost prediction, billing reconciliation, or local-usage estimation.
- TUI scraping or inference requests used as probes.
- Multiple accounts per provider.
- Automatic reset-credit redemption.
- A first-party live quota adapter for every AI DevKit environment.
- Direct use of undocumented provider credentials or private endpoints.

## User Stories

- As a human operator, I want to see which configured providers are authenticated and what authoritative capacity remains before choosing an agent.
- As an orchestrator, I want stable JSON with explicit `yes`, `no`, and `unknown` availability so I can apply my own unknown-data policy.
- As the agent-management workflow, I want provider and `agentType` fields that can be joined to launchable agent types.
- As a security-conscious self-hosted user, I want provider-owned authentication and redacted failures so capacity checks never disclose credentials.
- As a Codex user, I want native rolling windows and reset-credit counts without consuming a model turn or redeeming a credit.

## Shipped Command Surface

```text
ai-devkit capacity
ai-devkit capacity [provider]
ai-devkit capacity [provider] --json
ai-devkit capacity [provider] --max-age <seconds>
ai-devkit capacity [provider] --refresh
```

The default cache age is 300 seconds. `--refresh` bypasses cache. Unknown providers and invalid non-negative integer values for `--max-age` are invalid arguments.

## Acceptance Criteria

- `capacity` with no provider argument includes only providers whose configuration directory exists according to `ENVIRONMENT_DEFINITIONS.globalSkillPath`; PATH presence alone never adds a row.
- Every row exposes `configured`, `installed`, and nullable `authenticated` separately.
- JSON uses `schemaVersion: 1` and the shipped `CapacityReport` contract.
- Canonical capacity is `CapacityWindow[]`; daily and weekly aliases are conveniences derived from duration.
- Missing data produces `available: "unknown"`; only explicit provider exhaustion/blocking produces `"no"`.
- Codex uses `codex app-server --stdio` with `initialize`, `initialized`, then `account/rateLimits/read`; no model-turn method is called.
- Claude uses `claude auth status --json`; unsafe undocumented live usage is not called.
- Pi and GLM authentication may be detected, but their authoritative capacity remains unknown.
- Other configured providers are represented as unsupported with unknown availability.
- Provider probes run concurrently with isolated timeouts; a report with partial unknown rows exits successfully.
- Cache data is normalized and non-sensitive, with restrictive directory/file permissions.
- Output never contains tokens, account IDs, refresh tokens, endpoint URLs, headers, raw response bodies, stderr, or exception text.

## Constraints and Locked Decisions

- Command name is `capacity`.
- Default selection is configuration-directory based, not PATH based.
- Providers may expose arbitrary rolling or scoped windows; daily/weekly are not required.
- `unknown` is never equivalent to `yes`.
- Authentication stays owned by provider CLIs wherever possible.
- Capacity checking must not consume model quota.
- Reset credits are report-only and are never redeemed.
- The implementation remains local-first and self-host friendly.

## Open Items

No open item blocks the shipped feature. Future adapters require a documented, non-inference, credential-safe provider mechanism. Claude live subscription usage and z.ai/GLM quota discovery remain deliberately deferred.
