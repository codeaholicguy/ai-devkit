---
phase: testing
title: Slack Channel Connector Testing Strategy
description: Credential-free SDK-mocked validation for Slack transport, security, delivery, and Telegram compatibility
---

# Slack Channel Connector Testing Strategy

## Test Coverage Goals

- Pursue 100% statements/branches/functions/lines for new Slack-specific modules; document unreachable SDK defensive branches.
- Cover all trust-boundary rejection paths and retry/idempotency behavior.
- Exercise CLI-to-adapter-to-terminal and output-to-threaded-delivery integration with mocks.
- Keep all automated tests credential-free and network-free.

## Unit Tests

### Configuration and adapter seam

- [x] Discriminated Telegram and Slack entries round-trip through `ConfigStore` with mode `0600`.
- [x] Saving over a permissive existing `channels.json` repairs its mode to `0600`.
- [x] Existing Telegram entries parse and behave unchanged.
- [x] Runtime composition selects Telegram or Slack through the discriminated config without leaking config.

### Slack renderer and chunker

- [x] CommonMark emphasis, links, lists, inline code, and fenced code become safe Slack `mrkdwn`.
- [x] `&`, `<`, and `>` are escaped and plain broad mentions are not activated.
- [x] Long paragraphs, Unicode, lists, and fenced code split into independently valid chunks of at most 4,000 characters.
- [ ] Renderer failure falls back to bounded escaped plain text.

### Slack delivery queue

- [x] Jobs for one conversation remain ordered and first/continuation chunks use parent/thread timestamps.
- [x] Separate conversations use independent queue state.
- [x] Rate-limit errors honor retry metadata using an injected sleeper.
- [x] Rate limits retry once with bounded delay; permanent errors propagate.
- [x] Excessive `Retry-After` values are capped to prevent an unbounded worker stall.
- [x] Queue overflow is rejected without unbounded growth.

### Slack adapter events and health

- [x] Socket Mode start/stop updates health and registers listeners once.
- [x] Valid paired `message.im` normalizes all stable IDs and reaches the handler once.
- [x] Envelope acknowledgment occurs before slow message/interaction handling.
- [x] Wrong workspace/user/conversation, bot/self, subtype, missing ID, non-DM, and external/shared events are ignored.
- [x] Duplicate event IDs and duplicate interaction IDs are ignored across the bridge-lifetime window.
- [x] Event-ID storage evicts old entries at its bound.
- [x] Disconnect/reconnect lifecycle updates health without duplicate delivery.

### Pairing and interactions

- [x] Pairing codes are CSPRNG-derived, expire, compare safely, and are single-use.
- [x] Only a matching DM in the configured workspace stores user/conversation IDs; pairing text never reaches the agent.
- [x] Pairing persistence failure leaves the runtime unauthorized and listener rejection is isolated.
- [x] Slack Block Kit questions have bounded opaque values and accessible fallback text.
- [x] Question fallback text escapes Slack mention/control syntax.
- [x] Valid option/Skip actions write one digit/Escape and finalize once.
- [x] Wrong-user, wrong-conversation, expired, malformed, and replayed actions are acknowledged and ignored.

### CLI setup/status

- [x] Slack connect prompts for both secrets, validates identity, rejects incomplete token identity, and saves no config on failure.
- [x] List/status render provider-neutral workspace/bot/authorization data without tokens.
- [x] Named Slack foreground and daemon starts pass the actual channel type to the registry.
- [x] Daemon command/log/registry contain no app or bot token.

## Integration Tests

- [ ] Slack DM → normalized event → allowlist → `TtyWriter` flow.
- [ ] Agent assistant/system output → renderer → queue → parent/thread Web API calls.
- [x] Agent `AskUserQuestion` request → Slack blocks → action → raw terminal key.
- [x] Existing Telegram message, Markdown, callback, start/status, and daemon suites remain green.
- [ ] Duplicate event plus simulated rate limit/reconnect produces one terminal input and ordered output.

## End-to-End Tests

- [ ] Mocked custom-app setup, pairing, bridge start, message round trip, question action, and graceful stop.
- [ ] Unpaired/wrong-user attempt remains unable to control the agent.
- [x] Fresh full repository lint, typecheck/build, and relevant test suites pass.

## Test Data

- Synthetic Slack team/user/conversation/app/bot/event/envelope IDs.
- Official-SDK-shaped message and block-action fixtures.
- Fake Socket Mode emitter and Web API methods injected at adapter boundaries.
- Fake clock, sleeper, terminal writer, config path, bridge registry, and agent conversation/request stores.
- Tokens use unmistakably fake placeholders and are asserted absent from captured output/logs.

## Test Reporting & Coverage

- Targeted: `npx nx test channel-connector --coverage` and `npx nx test cli --coverage` where supported.
- Regression: `npm test` or repository-native affected/full commands discovered from package scripts.
- Static: package lint, typecheck, build, feature lint, and base lint.
- Final pre-commit gate exited 0: base/feature lifecycle lint, repository lint, six-project build, full repository tests, both coverage suites, and `git diff --check`.
- Connector coverage: 109 tests; 87.27% statements, 77.04% branches, 91.40% functions, 88.88% lines.
- CLI coverage: 921 tests; 71.00% statements, 61.09% branches, 69.48% functions, 72.10% lines. Slack question service: 96.66% statements, 95.83% branches, 100% functions/lines.

## Manual Testing

- [ ] Optional sandbox Slack workspace: create app from documented manifest, install, supply fake-free real tokens locally, pair via DM, start a bridge to a disposable agent, send/receive text and a question, force reconnect, inspect threaded long output, stop/disconnect, and revoke tokens.
- Not required for automated acceptance because CI and contributors must not possess Slack credentials.

## Performance and Reliability Testing

- [x] Deferred-handler test proves acknowledgment is not blocked by agent work.
- [x] Burst of more than queue capacity remains bounded.
- [x] 4,000+ character output produces ordered parent/thread calls.
- [x] Reconnect and duplicate delivery fixtures preserve exactly-once agent input within the local dedupe window.

## Bug Tracking

- Blocking security/correctness failures return to implementation immediately.
- Coverage gaps are added to the planning document before review.
- Credential-dependent Slack behavior not exercised automatically is recorded as residual manual risk in the PR.
