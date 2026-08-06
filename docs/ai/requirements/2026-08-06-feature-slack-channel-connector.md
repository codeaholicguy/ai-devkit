---
phase: requirements
title: Slack Channel Connector Requirements
description: Local-first single-workspace Slack Socket Mode bridge for supervised AI DevKit agents
---

# Slack Channel Connector Requirements

## Problem Statement

AI DevKit can bridge a running local agent to Telegram, but teams already supervising engineering work in Slack cannot receive agent assurance signals or answer bounded agent questions there. The current connector package is nominally provider-neutral while its configuration, runner, authorization, status, rendering, and interaction paths are Telegram-specific.

The target user is an individual developer or small team operator running AI DevKit locally who wants a private Slack DM control surface for one explicitly selected agent. Today they must use Telegram or remain at the local terminal.

## Goals & Objectives

### Goals

- Add a bidirectional Slack connector using official `@slack/socket-mode` and `@slack/web-api` SDKs.
- Preserve the local-first daemon model: outbound WebSocket/API connections only, with no public endpoint.
- Support one custom Slack app, workspace, paired Slack user, DM, and local agent per channel instance.
- Generalize the channel runner/configuration/interaction seams without changing Telegram behavior.
- Deliver safe Slack `mrkdwn`, semantic long-message chunks, threaded continuations, structured single-question interactions, prompt notifications, event idempotency, paced delivery, and reconnect-aware health.
- Make authorization fail closed and keep credentials out of process arguments, bridge registries, status, and logs.
- Position Slack as an assurance and orchestration supervision surface: completions, verification evidence, failures, blockers, reviews, and bounded decisions.

### Non-goals

- Public channels, `app_mention`, all-channel listening, slash commands, or Slack Connect.
- OAuth, distribution, Marketplace listing, multi-workspace installations, or hosted Events API endpoints.
- Multiple Slack users controlling one bridge.
- File upload or ingestion.
- Starting/killing arbitrary agents, arbitrary terminal selection, or generic remote-shell controls from Slack.
- Durable cloud delivery while the local daemon is offline.
- Reading or backfilling Slack conversation history.

## User Stories & Use Cases

- As a local developer, I can configure a Slack custom app with app and bot tokens and verify its identity without exposing either token.
- As a developer, I pair by sending a short-lived code in a DM so the first unrelated workspace user cannot claim my agent.
- As the paired user, I can DM an instruction to an explicitly bound running agent and receive new assistant/system output in the same DM.
- As the paired user, I receive long Markdown and fenced code as readable Slack-safe messages, with continuation chunks kept in a thread.
- As the paired user, I can answer a supported single-select agent question or skip it using Slack buttons.
- As the paired user, I receive other tool/approval prompts as notifications and can respond through the existing terminal input path; ordinary messages are never silently interpreted as an approval action.
- As an operator, I can start, stop, list, and inspect Slack bridges using existing named-channel and daemon commands.
- As an operator, I can see degraded connector health without tokens or sensitive prompt bodies being logged.

### Edge cases

- Events from another workspace, user, DM, bot, edited message, message subtype, Slack Connect context, or the connector itself are ignored or rejected.
- Duplicate Socket Mode envelopes/events and repeated button actions do not reach the agent twice.
- A stale or wrong-user button is acknowledged but cannot write to the terminal.
- HTTP 429 responses pause only the affected conversation queue according to `Retry-After`.
- WebSocket disconnect/reconnect does not create duplicate listeners or lose persisted pairing.
- Queue growth and idempotency state are bounded.
- Markdown rendering failure falls back to escaped plain text.

## Success Criteria

1. `channel connect slack --name <name>` validates official SDK credentials and persists a discriminated Slack config in the existing `0600` channel store.
2. Pairing requires a cryptographically random, expiring code delivered by the intended user in a Slack DM; stored allowlists include team, user, and conversation IDs.
3. Only allowlisted `message.im` text events reach `TtyWriter`; bot/self/subtype/duplicate/wrong-identity events never do.
4. New assistant/system output and agent request notifications are delivered through a provider-neutral runner without a Telegram regression.
5. Slack output escapes platform control characters, suppresses unintended mentions, preserves code, targets at most 4,000 characters per message, and sends continuation chunks with the first message's `thread_ts`.
6. A per-conversation sender serializes delivery, honors SDK rate-limit retry metadata, and enforces a bounded queue.
7. Supported single-select questions render as Slack buttons; valid actions acknowledge promptly and write exactly one digit or Escape key to the bound terminal.
8. App/bot tokens never appear in CLI status/list output, bridge metadata, daemon arguments, or debug logs.
9. Existing Telegram config, renderer, question buttons, foreground/daemon lifecycle, and unnamed single-Telegram resolution continue to pass existing tests.
10. New/changed code reaches the repository's practical coverage target, with 100% targeted coverage pursued and any tooling-generated exceptions documented.
11. Automated tests require no real Slack credentials; an optional sandbox-workspace manual procedure is documented.

## Constraints & Assumptions

- Node.js remains the runtime and package APIs remain ESM.
- Use official `@slack/socket-mode` and `@slack/web-api`; do not implement Slack signing, WebSocket, or Web API protocols directly.
- Required Slack configuration is Socket Mode, interactivity, bot user/App Home messages, bot scopes `chat:write` and `im:history`, app-level scope `connections:write`, and event `message.im`.
- Slack `mrkdwn` differs from CommonMark; rendering is provider-specific.
- Slack recommends short messages; the implementation uses a conservative 4,000-character ceiling and Slack threads rather than file uploads.
- `channels.json` remains the compatibility store and is protected with mode `0600`. OS keychain integration is a follow-up.
- Pairing is completed while the bridge is running and the generated code is held in memory; only the resulting allowlist is persisted.
- Socket Mode is not Marketplace-compatible, and Slack Marketplace policy is not part of this local custom-app MVP.
- Existing agent conversation polling limitations remain unless a provider-neutral change is necessary for Slack correctness.

## Alternatives Considered

- **Incoming webhook notifier:** fastest assurance-only validation but cannot support pairing, inbound commands, or questions.
- **Public Events API:** supports hosted scale and OAuth but violates the MVP's local-first/no-public-endpoint constraint.
- **Socket Mode DM-only:** chosen because it matches Telegram's outbound daemon model while supporting Events API and interactivity.

## Questions & Open Items

No material open items. Public-channel support, distributable OAuth, file uploads, and OS-keychain storage are explicitly deferred product decisions.
