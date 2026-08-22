---
phase: requirements
title: Capacity Command Requirements
description: Define fresh, read-only Codex capacity reporting
---

# Capacity Command Requirements

## Problem

Codex users need a factual capacity report before dispatching work. The command must obtain current data without starting a model turn, exposing credentials, or carrying provider and cache machinery that has no supported use.

## Command Surface

```text
ai-devkit capacity
ai-devkit capacity codex
ai-devkit capacity [codex] --json
```

The optional provider argument exists for discoverability and accepts only `codex`, case-insensitively. Any other value fails before probing. Every invocation probes fresh; there is no cache, `--max-age`, or `--refresh` option.

## Acceptance Criteria

- Capacity supports Codex only and always emits exactly one Codex row.
- `@ai-devkit/agent-manager` owns probing, normalization, detection, and public capacity types.
- The CLI owns only command registration, provider validation, the agent-manager call, and text/JSON rendering.
- JSON reports the provider, generation time, authentication, availability, native usage windows (`id`, `label`, `durationMinutes`, `usedPercent`, `resetsAt`), and remaining credits in one flat object. Derived values and provider-internals are omitted; fields may be added when a second provider lands.
- Codex configuration and executable presence are reported independently.
- Probing prefers PAT, then fresh OAuth, then the hardened read-only Codex app-server fallback.
- Missing data is `unknown`, never inferred as available; explicit exhaustion may report `no`.
- Probing never starts a model turn, refreshes credentials, writes provider data, or exposes secrets/raw failures.
- Existing meaningful normalization, fallback, redaction, rendering, and command-contract tests remain covered in their owning packages.

## Non-Goals

- Claude, Pi, GLM, generic provider stubs, or future-provider scaffolding.
- Cross-provider selection, parallel orchestration, partial multi-provider results, or scheduling policy.
- Cached or historical capacity, forecasting, cost prediction, token-history estimation, or reset-credit redemption.
- OAuth refresh, TUI scraping, or inference-based probes.

## Constraints

- Keep the schema stable where it still describes Codex truthfully.
- Use provider-owned credentials read-only and discard raw exception details.
- Do not add a dependency: the CLI already depends on agent-manager.
