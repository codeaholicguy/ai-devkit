---
phase: implementation
title: Claude Capacity Implementation Record
description: Implementation details and validation evidence for Claude subscription capacity
---

# Claude Capacity Implementation Record

## Development Setup

- Active worktree: `.worktrees/feature-claude-capacity`
- Branch: `feature-claude-capacity`
- Bootstrap: `npm ci`
- Initial workspace build: `npm run build`
- No new dependencies or configuration files were added.

## Code Structure

- `packages/agent-manager/src/capacity/claude.ts`: provider-owned options, Claude credential resolution, usage parsing, request construction, timeout, and sanitized failures.
- `packages/agent-manager/src/capacity/index.ts`: clock-aware public report reader and option-type re-export.
- `packages/agent-manager/src/index.ts`: package-level public export.
- `packages/cli/src/commands/capacity.ts`: direct Claude provider selection alongside Codex and z.ai.
- `packages/cli/src/commands/capacity/render.ts`: Anthropic display label using the existing renderer.
- `packages/agent-manager/src/__tests__/capacity/fixtures/claude-*.json`: fake credential, complete, partial, and malformed fixtures.
- Provider and CLI capacity tests cover all requested behavior without live access.

## Implementation Notes

### Credential handling

- `CLAUDE_CODE_OAUTH_TOKEN` has precedence and bypasses file reads.
- A non-empty `CLAUDE_CONFIG_DIR` selects the profile root; relative values resolve against the injected/current working directory.
- The fallback path is `$HOME/.claude/.credentials.json` (or the operating-system home when `HOME` is absent).
- On macOS, a missing or tokenless default profile falls back to the `Claude Code-credentials` generic-password service through bounded `/usr/bin/security` execution.
- macOS controls access approval and may display a Keychain prompt on first use; implementation and tests never invoke the real reader.
- A custom `CLAUDE_CONFIG_DIR` never falls back to the global Keychain item, preventing cross-profile credential mixing.
- Only `claudeAiOauth.accessToken` and optional numeric millisecond `expiresAt` are read.
- Known-expired credentials fail before the fetch. Missing expiry is accepted.
- No refresh token, credential write, or Claude subprocess path exists.
- Profile-file and Keychain parsing use separate immutable credential results, keeping source precedence explicit and preventing state from one source being reused as another.

### Usage mapping

- Five-hour and seven-day account windows map to session and weekly capacity.
- Flat Sonnet and Opus weekly fields map independently.
- Weekly scoped limits use stable model slugs, ignore all-model scopes, keep the first duplicate, and do not filter on `is_active`.
- Enabled extra usage maps to the existing `CREDIT_LIMIT` fields after converting both returned minor-unit amounts to major units.
- Missing/invalid optional fields remain `null` or are skipped; they never become token totals.
- Availability is derived only from known utilization values.

### Request and errors

- One bounded GET is made to the OAuth usage endpoint with the exact Bearer, beta, JSON, and Claude Code User-Agent headers.
- 401, 403, 429, other non-success statuses, network failures, and malformed JSON have provider-local sanitized errors.
- Numeric and HTTP-date Retry-After values normalize against the injected clock.
- Response bodies, paths, and tokens are never included in errors or reports.

## Integration Points

- The existing multi-provider loop remains sequential and keeps successful reports when another provider fails.
- Explicit `Claude` input normalizes case-insensitively to `claude`.
- Default capacity now probes `codex`, `zai`, and `claude`.
- The existing renderer sorts windows by duration and renders credit totals without a Claude-specific path.

## Design Alignment

The implementation matches the approved provider-local design and unchanged public capacity contracts. There are no material design deviations. The fixed `claude-code/2.1.0` User-Agent intentionally avoids version-detection subprocess behavior.

## Validation Evidence

- Red/green cycles were observed for the public entry point, environment request, profile credential, Keychain fallback/profile isolation, expiry, complete mapping, 401, 403, 429, malformed JSON, network failure, package export, and CLI provider selection.
- Latest focused provider run: 27 tests passed, 0 failed.
- Latest focused CLI capacity run: 13 tests passed, 0 failed.
- Full agent-manager run: 57 files and 689 tests passed.
- Full CLI run: 102 files and 1,207 tests passed.
- Full repository run: all six workspaces passed, totaling 199 files and 2,307 tests.
- Full agent-manager coverage passed its thresholds: 88.54% statements, 77.31% branches, 93.58% functions, and 91.58% lines. `claude.ts` reached 94.89% statements, 85.71% branches, 95.83% functions, and 95.86% lines; the uncovered paths are a rejected injected Keychain reader and the real `/usr/bin/security` boundary that tests deliberately avoid invoking.
- Workspace build, repository lint, feature lint, new-file formatting, and `git diff --check` passed.
- A focused-only coverage invocation exited nonzero because package-global thresholds include unrelated files omitted by that focused run; the subsequent full package coverage run passed.
- Repository-wide formatting remains red on the same 37 files as the base worktree. A formatter check over every new source, test, fixture, and lifecycle document passed; modified existing files retain their baseline style to avoid unrelated formatting churn.
- Final design-alignment review found no blocking, important, or nice-to-have findings.

## Security Notes

- Tests contain only obvious fake tokens and fixture data.
- No live account call, real credential read, Keychain prompt, refresh, commit, or push occurred.
- All external boundaries are injected and fixture-backed.
