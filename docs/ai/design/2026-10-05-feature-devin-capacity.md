---
phase: design
title: System Design & Architecture
description: Define architecture, data models, APIs, components, and design decisions
---

# System Design & Architecture

## Architecture Overview

Mirror the established provider/source split:

- `capacity/providers/devin.ts` — pure fetch + parse of the quota endpoint (`fetchDevinCapacity`, `parseDevinCapacity`). No credential knowledge; takes `{ key, orgId }`.
- `harnesses/devin/credentials.ts` — resolve `{ key, orgId }` from env/file config (`resolveDevinCredential`).
- `capacity/sources/devin.ts` — `probeDevinCapacity` assembles the `CapacityReport` (`harness: "devin"`, `provider: "devin"`); converts 401/403 into `authenticated: false` reports.
- `capacity/index.ts` — `getDevinCapacityReport` wrapper matching the other `get*CapacityReport` functions.
- `cli/src/commands/capacity.ts` — add `"devin"` to `SUPPORTED_PROVIDERS` + dispatch.
- `cli/src/commands/capacity/render.ts` — add `devin: "Devin"` provider label.

Call flow: `capacityCommand` → `getDevinCapacityReport` → `probeDevinCapacity` → `resolveDevinCredential` (env `DEVIN_API_KEY` → `~/.local/share/devin/credentials.toml` `windsurf_api_key`; org from `~/.config/devin/config.json` `devin.org_id`) → `fetchDevinCapacity` → `parseDevinCapacity` → report.

## Data Models

Upstream response (verified live, 200):

```json
{
  "is_quota_plan": true,
  "has_quota_allocation": true,
  "daily_percentage": 0,
  "weekly_percentage": 0,
  "daily_reset_at": "2026-10-06T00:00:00-08:00",
  "weekly_reset_at": "2026-10-11T00:00:00-08:00",
  "overage_balance": 0.0,
  "hide_daily_quota": true
}
```

Mapping to `ProviderCapacitySnapshot`:

| Field | Mapping |
|---|---|
| `daily_percentage` + `daily_reset_at` | window `{id: "devin:daily", label: "Daily", durationMinutes: 1440, usedPercent, resetsAt}` — omitted when `hide_daily_quota` is true |
| `weekly_percentage` + `weekly_reset_at` | window `{id: "devin:weekly", label: "Weekly", durationMinutes: 10080, usedPercent, resetsAt}` |
| `overage_balance` | `creditsRemaining` (number or null) |
| `is_quota_plan`/`has_quota_allocation` false | `{authenticated: true, available: "unknown", windows: [], creditsRemaining: null}` |
| 401/403 HTTP | `{authenticated: false, available: "unknown", windows: [], creditsRemaining: null}` (returned, not thrown) |
| other non-200 | throw `Devin quota request failed: HTTP <status>` |

`usedPercent` clamped 0–100; missing/invalid percentage fields → `usedPercent: null` on that window (honest degrade, never fabricated).

## API Design

```ts
// harnesses/devin/credentials.ts
export type DevinCredential = { key: string; orgId: string };
export type DevinCredentialOptions = {
  env?: NodeJS.ProcessEnv;
  readFile?: (path: string, encoding: BufferEncoding) => Promise<string>;
};
export function resolveDevinCredential(options?): Promise<DevinCredential>;

// capacity/providers/devin.ts
export function parseDevinCapacity(raw: unknown): ProviderCapacitySnapshot;
export function fetchDevinCapacity(
  credential: DevinCredential,
  options?: { fetch?: typeof fetch; timeoutMs?: number },
): Promise<ProviderCapacitySnapshot>;

// capacity/sources/devin.ts
export type DevinCapacityOptions = DevinCredentialOptions & {
  now?: () => Date; fetch?: typeof fetch; timeoutMs?: number;
};
export function probeDevinCapacity(options): Promise<CapacityReport>;
```

## Component Breakdown

- credentials: reads two files; `credentials.toml` parsed as flat `key = "value"` TOML (agent-manager has no TOML dep; the file is flat by construction). Sanitized errors — never include file content.
- provider: GET `https://app.devin.ai/api/<orgId>/billing/quota/usage`, `Authorization: Bearer <key>`, 5s timeout; strict-but-tolerant parsing (unknown extra fields ignored).
- source: thin assembler; 401/403 classified to unauthenticated report here (fetcher throws a typed status error).
- CLI: one new provider entry; normalization accepts `"devin"` only.

## Design Decisions

1. **No shared parser extraction** — response shape is unique to Devin; nothing to share with wham/zai.
2. **Org from config.json, not credentials.toml** — verified location; no other source exists. Env override for key only (`DEVIN_API_KEY`), org override `DEVIN_ORG_ID` for testability/enterprise installs.
3. **`hide_daily_quota` honored** — matches webapp behavior; the daily row would mislead.
4. **`overage_balance` → `creditsRemaining`** — closest existing semantic (money/ACU balance); raw value surfaced, unit not fabricated.
5. **401/403 → report, not throw** — matches anthropic provider precedent so a revoked login shows NOT AUTHENTICATED instead of a warning.

## Non-Functional Requirements

- Token never appears in errors, reports, logs, or fixtures (tests assert via `JSON.stringify` absence checks).
- 5s request timeout; single GET; no retries.
- No new runtime dependencies.
