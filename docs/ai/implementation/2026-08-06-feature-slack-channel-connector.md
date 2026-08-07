---
phase: implementation
title: Slack Channel Connector Implementation Guide
description: Living implementation record for the Slack Socket Mode connector
---

# Slack Channel Connector Implementation Guide

## Development Setup

- Active worktree: `.worktrees/feature-slack-channel-connector`
- Branch: `feature-slack-channel-connector`
- Base: latest `origin/main` at workspace creation
- Dependencies: deterministic `npm ci`; official Slack SDK packages are added through the lockfile.
- Automated tests use injected SDK clients and synthetic fixtures; no real credentials are required.

## Code Structure

- `packages/channel-connector/src/types.ts`: discriminated config and normalized provider-neutral events.
- `packages/channel-connector/src/adapters/`: Telegram and Slack transport implementations plus capability contracts.
- `packages/channel-connector/src/utils/`: provider-specific Markdown rendering/chunking and bounded delivery helpers.
- `packages/cli/src/services/channel/`: provider setup/factory, generic bridge runner, active-conversation routing, and structured questions.
- `packages/cli/src/commands/channel.ts`: provider-neutral connect/list/start/status UX.
- `web/content/docs/12-channel.md`: user setup, manifest, security, and manual validation.

## Implementation Notes

### Task 1.1 — Provider contracts

- Changed `types.ts`, `ChannelAdapter.ts`, public exports, and ConfigStore/manager tests.
- Red: ConfigStore test failed because `isSlackEntry` did not exist.
- Green/refactor: introduced a discriminated config union, Slack config, stable message/thread metadata, generic send results/options, question/interaction models, and an interactive adapter type guard.
- Evidence: 14 targeted tests and package typecheck pass.
- Design deviation: `sendMessage` permits `void` so the published Telegram implementation remains source-compatible; new providers return `SentMessage`.

### Task 1.2 — Slack renderer and chunker

- Added `slackMarkdown.ts` and public exports with `marked` token rendering, Slack control-character escaping, conservative formatting, semantic code splitting, and Unicode-safe hard splitting.
- Red: renderer test suite failed because the Slack utility did not exist.
- Green/refactor: four formatting/chunking tests and package typecheck pass.
- Edge cases: broad mentions remain literal, code chunks are independently fenced, and rendered chunks stay at or below 4,000 characters.

### Task 1.3 — Slack delivery queue

- Added official Slack SDK dependencies and `SlackDeliveryQueue`.
- Red: queue tests failed because the module did not exist.
- Green/refactor: per-conversation FIFO state, parent/thread sends, one explicit rate-limit retry, injected sleep, and queue bounds pass three tests plus typecheck.
- Security/performance: Web API payloads disable unfurls and queue state is removed when drained.

### Task 2.1 — Slack adapter

- Added `SlackAdapter` backed by official `SocketModeClient` and `WebClient`, with injectable SDK-shaped clients.
- Red: adapter suite failed because the module did not exist.
- Green/refactor: nine tests cover lifecycle/health, prompt acknowledgment order, normalization, idempotency, and identity/message filtering; typecheck passes.
- Trust boundary: stable event IDs are recorded before consumer dispatch and listener failures cannot reject the SDK event loop.

### Task 2.2 — Proof-of-concept DM routing

- Removed pairing and persisted Slack-user allowlists for the proof of concept.
- Red: an ordinary configured-workspace DM was consumed instead of reaching the message handler.
- Green/refactor: valid DMs are normalized immediately; the CLI uses the first DM as the process-local response destination while the adapter continues rejecting wrong-workspace, bot/self, subtype, non-DM, and Slack Connect events.

### Tasks 2.3 and 3.1-3.3 — Questions, CLI, runtime, and docs

- Added Slack Block Kit question rendering and `SlackQuestionService`; valid option/Skip actions finalize once and write one digit/Escape.
- Added `channel connect slack` with hidden prompts plus official `apps.connections.open` and `auth.test` validation. Bot identity requires Slack's documented `user_id` and `team_id`; optional `app_id` is retained when returned.
- Generalized runner input/output, provider construction, active-DM routing, bridge type metadata, list/status identity, and daemon launch without credential arguments.
- Added the exact minimal Slack manifest, proof-of-concept security warning, troubleshooting guidance, and optional sandbox validation to channel docs.
- Red/green evidence: missing question service, setup behavior, app-token validation, and discriminated runner compilation each failed before implementation; 16 adapter tests, 22 targeted CLI tests, connector typecheck, and both package builds pass.
- Design deviation: the runner branches at its provider composition root rather than introducing a separate factory file; provider SDK details remain inside `channel-connector` and the branch is exhaustive over implemented providers.

## Integration Points

- Slack Socket Mode events enter `channel-connector`; agent discovery and TTY writes stay in the CLI.
- Agent conversation/request polling emits through a generic adapter interface.
- Slack credentials remain in `ConfigStore`; bridge metadata and daemon arguments contain names/IDs only.
- Telegram remains an implementation of the same contracts.

## Error Handling

- Reject malformed, wrong-workspace, bot/self, non-DM, and shared-channel events without terminal side effects.
- Acknowledge Slack envelopes/actions before asynchronous processing.
- Retry only rate-limit/transient outbound failures with explicit bounds.
- Preserve plain-text delivery fallback when rendering fails.
- Surface safe health/setup errors without tokens or raw SDK credential payloads.

## Performance Considerations

- Bounded recent-event and interaction maps.
- Bounded per-conversation queues with serialized workers.
- Semantic chunking before API calls; no conversation-history reads from Slack.
- Existing two-second agent output polling remains unchanged.

## Security Notes

- Exact workspace validation and DM-only transport filtering; Slack-user authorization is intentionally deferred during the proof of concept.
- No first-message authorization.
- No automatic mention parsing or generic approval inference.
- Mode-`0600` config/registry/log files and credential-free daemon argv.
- Official Slack SDK networking with normal TLS verification.

## Formal Final Security Review

The installed `ai-devkit:security-review` checklist was applied to the complete `origin/main...HEAD` diff on 2026-08-06. Result: no unresolved critical or high feature-specific findings.

- **Credentials and process exposure:** app/bot tokens enter through hidden prompts, are passed only to official SDK constructors, and are absent from daemon argv, bridge registry, status/list output, debug statements, and user-facing errors. Slack setup deliberately replaces SDK errors with a credential-safe message.
- **Storage and migration:** `channels.json` persists secrets in the existing local store and now forces `0600` after every write, including overwriting a permissive existing file. Telegram entries retain their prior shape. Missing/corrupt/unknown channel configurations do not construct a Slack adapter and therefore fail closed.
- **Inbound proof-of-concept boundary:** exact workspace and DM event shape are required, but no Slack user is authorized. The first DM becomes the process-local response destination; bot/self/subtype/non-DM/Slack Connect events are acknowledged and rejected. Any workspace member who reaches that active DM can write text to the bound agent terminal.
- **Replay and acknowledgment:** Socket Mode event/action envelopes are acknowledged before consumer work. A bounded 1,000-ID bridge-lifetime set suppresses retries and reconnect duplicates; question state additionally binds conversation/message/value, expires after ten minutes, and is consumed before terminal input.
- **Approval boundary and terminal input:** ordinary active-DM text uses the existing message-to-bound-TTY path and is never interpreted as approval. Only a current `AskUserQuestion` Block Kit action can call `sendKey`, and accepted values are exactly one generated option digit or Escape for Skip.
- **Outbound safety and availability:** Slack control characters are escaped in rendered content and question fallback text, so ordinary Markdown cannot create mentions. Output is capped at 4,000 characters per call, unfurls are disabled, queues are bounded to 100 jobs per conversation, retry occurs once, and an excessive `Retry-After` is capped at 60 seconds.
- **Dependencies:** the lockfile resolves official `@slack/socket-mode@3.0.0` and `@slack/web-api@8.0.0`. `npm audit --audit-level=critical --omit=dev` exits 0 with no critical advisory. Its 5 high, 5 moderate, and 1 low reports are pre-existing transitive dependency findings outside the introduced Slack SDK path; broad upgrades are outside this feature and should be handled separately.
- **Compatibility:** the discriminated provider seam preserves Telegram configuration and behavior; the full repository lint/build/test gate exercises existing Telegram suites.

Review-driven red/green fixes covered permissive existing config permissions, listener rejection isolation, question fallback mention escaping, excessive rate-limit delay, duplicate SDK acknowledgment, and expired interactive actions. Pairing was later removed explicitly for proof-of-concept simplicity.

## Deviations and Follow-ups

- Event idempotency is bounded to the 1,000 most recent IDs for the bridge lifetime rather than time-expiring; this keeps memory bounded and covers Socket Mode retry/reconnect duplication without persistence.
- Structured questions are single-select in the MVP and expire after ten minutes. Multi-select continues through the existing terminal interaction rather than guessing Slack approval semantics.
- Security review findings and their TDD remediations are recorded in the formal review above. No blocking feature-specific findings remain.
- `npm audit --audit-level=critical --omit=dev` reports no critical advisories; existing lower-severity transitive advisories remain outside this scoped feature.
- Real Slack credential validation was intentionally not performed; the documented sandbox exercise remains optional manual validation.
