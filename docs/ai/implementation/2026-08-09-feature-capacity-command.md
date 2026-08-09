---
phase: implementation
title: Capacity Command Implementation Record
description: Shipped modules, integration points, invariants, and operational behavior
---

# Capacity Command Implementation Record

## Shipped Module Map

```text
packages/cli/src/
├── cli.ts
└── commands/
    ├── capacity.ts
    └── capacity/
        ├── types.ts
        ├── detection.ts
        ├── orchestrate.ts
        ├── cache.ts
        ├── render.ts
        └── providers/
            ├── codex.ts
            ├── claude.ts
            ├── pi.ts
            └── stub.ts
```

Tests live in `packages/cli/src/__tests__/commands/capacity/`.

## CLI Registration

`cli.ts` imports and calls `registerCapacityCommand(program)`. `commands/capacity.ts` owns Commander configuration, validates `--max-age`, calls `getCapacityReport`, and hands the result to `renderCapacityReport`. It exposes only:

```text
capacity [provider] [--json] [--max-age <seconds>] [--refresh]
```

## Module Responsibilities

- `types.ts`: exact schema-v1 TypeScript contract.
- `detection.ts`: derives provider config directories from `ENVIRONMENT_DEFINITIONS.globalSkillPath` and independently checks executable access on PATH.
- `orchestrate.ts`: validates provider names, selects configured providers by default, runs probes concurrently, isolates failures/timeouts, reads/writes cache, sorts rows, and constructs the report.
- `cache.ts`: reads freshness-keyed normalized reports and performs atomic restrictive writes under `~/.ai-devkit/cache/capacity.json` (`0700` directory, `0600` file).
- `render.ts`: emits exact pretty JSON or a text table with Auth, Available, shortest/longest native windows, reset credits, and warnings.
- `providers/codex.ts`: drives app-server JSON-RPC and sanitizes/normalizes rate-limit snapshots.
- `providers/claude.ts`: invokes and safely parses `claude auth status --json`; does not fetch live quota.
- `providers/pi.ts`: reads only Pi auth provider names and derives Pi/GLM authentication.
- `providers/stub.ts`: builds truthful unsupported/unknown rows for providers without adapters.

## Codex JSON-RPC Client

The adapter spawns `codex app-server --stdio` with piped stdin/stdout and ignored stderr. It writes newline-delimited JSON:

1. `initialize` with `clientInfo` and `capabilities: null`.
2. After response id 1, `initialized`.
3. `account/rateLimits/read` with request id 2 and no parameters.

Response id 2 is normalized and the subprocess is terminated. A five-second adapter timer bounds the exchange. The transport function is injectable, so CI tests use no subprocess or network.

Mapping behavior:

- Normalize backward-compatible `rateLimits` and `rateLimitsByLimitId` snapshots.
- Preserve primary/secondary windows by scoped ID and remove duplicates.
- Convert epoch reset timestamps to ISO-8601.
- Clamp derived remaining percent to 0–100.
- Derive daily/weekly aliases by duration tolerance only.
- Treat a reported reached type as explicit `available: no`; missing windows remain unknown.
- Report only reset-credit `availableCount`; no consume method exists.

## Provider Detection and Unknown Semantics

The default row set is determined before binary checks. Configured, installed, and authenticated are stored independently. A configured but uninstalled provider remains visible. An installed but unconfigured provider does not enter the default report. Explicitly requested known providers are reported even when unconfigured.

Only authoritative Codex utilization can establish `available: yes`. Claude, Pi, GLM, and unsupported providers remain `available: unknown` without verified quota data.

## Failure Handling

- Adapter exceptions never escape into report text.
- Orchestration catches each provider independently and emits a retryable fixed-code unknown row.
- Cache read/write failures are non-fatal.
- Unknown providers and invalid max-age values are command errors.
- Claude logged-out JSON is accepted from bounded stdout even when the CLI returns nonzero; stderr remains unused.
- A report, including a partial report, exits successfully.

## Security Invariants

- No tokens, account IDs, refresh tokens, endpoint URLs, headers, raw bodies, stderr, or raw exception messages are emitted or cached.
- No credential is placed on a subprocess command line.
- Codex authentication and refresh remain inside Codex app-server.
- Codex labels, IDs, scopes, and plans are constrained before output; Claude plan metadata is constrained too.
- Pi credential values are parsed only to discover top-level provider names and are never retained in normalized output.
- Cache contains only normalized report data with restrictive permissions.
- Capacity checks contain no model-start/inference method and never redeem reset credits.

## Design Alignment and Deviations

The shipped implementation matches the locked design. The brainstorm considered guarded use of Claude's undocumented OAuth usage endpoint; implementation review rejected that risk and shipped authentication-only Claude support. The brainstorm's broader draft schema contained fields such as transport provider and stale-after metadata; schema v1 intentionally uses the smaller contract in `types.ts`.

No code change, data migration, new dependency, or rollout flag is required for these lifecycle documents.
