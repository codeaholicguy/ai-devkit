---
phase: implementation
title: Capacity Command Implementation Record
description: Codex-only capacity model and thin CLI integration
---

# Capacity Command Implementation Record

## Module Map

```text
packages/agent-manager/src/
├── capacity/
│   ├── index.ts       # detection, one fresh probe, report construction
│   ├── codex.ts       # PAT/OAuth/app-server probing and normalization
│   └── types.ts       # capacity report model
└── __tests__/capacity/
    ├── index.test.ts
    └── codex.test.ts

packages/cli/src/commands/
├── capacity.ts        # Commander registration, provider validation, manager call
└── capacity/render.ts # human and JSON presentation
```

Agent-manager's root `index.ts` exports `getCodexCapacityReport` and the public capacity types. No package dependency was added because the CLI already depends on `@ai-devkit/agent-manager`.

## Runtime Behavior

`capacity` and `capacity codex` are equivalent. An explicit provider is normalized to lowercase and must be `codex`. The report function checks installation, invokes the Codex probe on every call, catches unexpected probe failures into a fixed unknown result, and returns one flat report: provider, generatedAt, authenticated, available, native windows, creditsRemaining.

The retained Codex implementation validates normalized identifiers and labels, preserves arbitrary windows, keeps unknown values null, and keeps the PAT → fresh OAuth → hardened app-server sequence. It does not refresh tokens or invoke a model method.

## Removed Implementation

- `capacity/cache.ts` and its cache test.
- `capacity/detection.ts` generic environment discovery and its test.
- `capacity/orchestrate.ts` provider selection, grouping, sorting, caching, dependency graph, and its tests.
- Claude, Pi/GLM, and unsupported stub providers plus provider tests.
- CLI max-age parsing and refresh forwarding.

## Simplification Review

The complete opportunity ledger is in the design document. Acted changes remove unused feature surface and abstractions. Rejected changes retain the stable JSON contract, meaningful tiered probing, normalized usage details, and isolated rendering because deleting them would reduce behavior or clarity rather than complexity.

## Security Invariants

- Only normalized allowlisted data crosses the agent-manager boundary.
- PATs, access/refresh tokens, account IDs, headers, bodies, stderr, and raw exceptions are not emitted.
- The CLI fallback uses read-only/untrusted app-server flags and account-only methods.
- Missing or failed data remains unknown; reset credits are never redeemed.
- Every run is read-only and fresh, with no AI DevKit capacity cache writes.
