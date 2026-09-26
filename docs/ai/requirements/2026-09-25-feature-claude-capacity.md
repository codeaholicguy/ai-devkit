---
phase: requirements
title: Claude Capacity Requirements
description: Add read-only Claude subscription usage to the capacity command
---

# Claude Capacity Requirements

## Problem Statement

AI DevKit users can inspect Codex and z.ai capacity, but cannot inspect the Claude subscription limits that govern Claude Code work. They currently have to open Claude Code or another application and reconcile different usage windows manually before dispatching work.

The `capacity` command needs a truthful, read-only Claude provider that uses the subscription OAuth usage endpoint without starting a model turn, refreshing or mutating credentials, or exposing secrets.

## Goals & Objectives

- Add `claude` to the existing multi-provider `capacity` command.
- Fetch current subscription usage from `GET https://api.anthropic.com/api/oauth/usage` with OAuth Bearer authentication, `anthropic-beta: oauth-2025-04-20`, and a `claude-code/<version>` User-Agent.
- Reuse `CapacityReport` and `CapacityWindow` for five-hour, seven-day, model-weekly, scoped-limit, and optional extra-usage data.
- Resolve credentials from `CLAUDE_CODE_OAUTH_TOKEN`, then the active Claude Code profile's `.credentials.json`, then the default-profile macOS Claude Code Keychain item.
- Keep all tests deterministic and fixture-based.

### Non-goals

- Writing or refreshing macOS Keychain credentials, or associating the global Keychain item with a custom `CLAUDE_CONFIG_DIR` profile.
- Spawning Claude Code as an auth or usage fallback, parsing its TUI, refreshing OAuth, or starting a model turn.
- Supporting API-key, Bedrock, Vertex, Foundry, gateway, browser-cookie, or Admin API usage.
- Inventing absolute token totals, forecasting future capacity, caching responses, or adding provider-specific CLI flags.
- Introducing a provider registry, generic HTTP framework, generic credential framework, or other future-provider abstractions.

## User Stories & Use Cases

- As a Claude subscription user, I can run `ai-devkit capacity claude` and see current Claude usage windows and resets.
- As a multi-provider user, I can run `ai-devkit capacity` and see Claude alongside Codex and z.ai while retaining partial-failure behavior.
- As an automation user, I can supply `CLAUDE_CODE_OAUTH_TOKEN` without placing credentials in a repository.
- As a user with a custom Claude profile, I can set `CLAUDE_CONFIG_DIR` and have the matching `.credentials.json` inspected.
- As a default-profile macOS user, my existing `Claude Code-credentials` Keychain item is used when no environment or file token is available.
- As a user with missing, expired, rejected, forbidden, or rate-limited authentication, I receive a stable sanitized error and no secret or raw response-body leakage.

## Success Criteria

- `claude` is a supported provider and the no-argument command probes Codex, z.ai, and Claude.
- The request uses the exact endpoint and required headers. The OAuth token never appears in returned reports or errors.
- `five_hour` maps to a 300-minute window and `seven_day` maps to a 10,080-minute window.
- Known flat model-weekly fields (`seven_day_sonnet`, `seven_day_opus`) map independently when present.
- Valid `limits` entries with `kind: weekly_scoped`, `group: weekly`, and a model scope map to weekly windows. Duplicate scopes and all-model scopes are omitted; `is_active` does not suppress otherwise valid limits.
- Utilization maps to `usedPercent`; valid `resets_at` values normalize to ISO timestamps; absent or invalid optional values remain unknown.
- Enabled `extra_usage` maps to a `CREDIT_LIMIT` window using returned utilization, monthly limit, used credits, and currency. Monetary totals may be converted from the endpoint's minor units to major units; no value is represented as tokens.
- Missing and expired credentials fail before fetch. HTTP 401, 403, and 429 have distinct sanitized failures, and 429 recognizes delta-seconds and HTTP-date `Retry-After`.
- Environment and profile-file credentials take precedence over Keychain. Keychain lookup is macOS-only and is skipped for custom profiles to prevent cross-profile credential mixing.
- Invalid JSON and non-object payloads fail as malformed. Partial object payloads retain valid windows without manufacturing missing data.
- All new provider and CLI behavior is covered with fixtures and injected environment, file, clock, fetch, and version boundaries. No test accesses a real credential, account, Keychain, or network endpoint.

## Constraints & Assumptions

- `@ai-devkit/agent-manager` continues to own capacity probing, normalization, and public capacity types; the CLI remains a thin selector and renderer.
- Credential precedence is `CLAUDE_CODE_OAUTH_TOKEN`, then `<profile-root>/.credentials.json`, then the default-profile macOS Keychain service `Claude Code-credentials`. A non-empty `CLAUDE_CONFIG_DIR` is the profile root and deliberately disables the global Keychain fallback.
- Relative `CLAUDE_CONFIG_DIR` values resolve against the process working directory, matching Claude Code profile behavior.
- The credentials file shape is `claudeAiOauth.accessToken` with optional millisecond `expiresAt`. A known expiry at or before the injected clock is expired; a missing expiry is accepted because long-lived/setup tokens may not expose one.
- MVP uses a fixed valid Claude Code fallback version in the User-Agent. It does not execute Claude merely to discover a version.
- `extra_usage.monthly_limit` and `used_credits` use the minor currency-unit behavior documented by the supplied CodexBar reference and are converted together to major units.
- Existing sequential multi-provider probing and partial-failure behavior remain unchanged.
- Timeouts remain provider-local and bounded.

## Questions & Open Items

No material open items remain. Claude CLI fallback remains post-MVP because auth status does not return usage credentials and interactive subprocess parsing would be brittle.
