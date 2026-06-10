---
phase: implementation
title: "Pi Adapter Implementation Notes"
feature: pi-adapter
description: Implementation details and verification evidence for Pi adapter support
---

# Implementation: Pi Adapter

## Development Setup

- Feature worktree: `.worktrees/feature-pi-adapter`
- Branch: `feature-pi-adapter`
- Dependency bootstrap: `npm ci` completed; Husky prepare could not write `.git/config` in the sandbox, but npm exited 0.

## Code Structure

- `packages/agent-manager/src/adapters/PiAdapter.ts`: Pi process detection, tracker matching, fallback matching, JSONL parsing, conversations, and historical session listing.
- `packages/agent-manager/src/adapters/AgentAdapter.ts`: `AgentType` now includes `pi`.
- `packages/agent-manager/src/index.ts` and `packages/agent-manager/src/adapters/index.ts`: export `PiAdapter`.
- `packages/cli/src/commands/agent.ts`: registers `PiAdapter` and labels `pi` as `Pi`.
- `packages/cli/src/services/channel/channel-runner.ts`: registers `PiAdapter` for channel bridge agent resolution.
- `packages/cli/src/util/sessions.ts`: accepts `--type pi`.

## Implementation Notes

### Core Features
- Exact matching: reads `~/.pi/agent/sessions.json` as a plain PID-to-session-path map.
- Path safety: tracker paths are used only when they resolve inside `~/.pi/agent/sessions`.
- Fallback matching: recursively discovers Pi `.jsonl` files and reuses `matchProcessesToSessions()`.
- Encoded project directories: fallback matching builds Pi's encoded directory form from each live process CWD, then compares that value to session parent directory names. It does not decode directory names because real path segments can contain hyphens.
- Parsing: JSONL lines are parsed permissively; malformed lines are skipped.
- Summaries: latest user message becomes the `AgentInfo.summary`; process-only fallback uses `Pi process running`.
- Detail parsing: Pi `type: "message"` records are parsed from nested `message.role` and `message.content` fields, including text-part arrays like `[{ type: "text", text: "hello" }]`.
- Simplification pass: detection is split into tracker and fallback mapping stages; JSONL entries are parsed once for session summaries; message parsing now uses explicit nested-message helpers instead of treating every `type` value as a possible role.

### Patterns & Best Practices
- Matches existing adapter structure: process discovery, registry cache, direct matching, fallback matching, process-only fallback.
- Uses shared utilities for safe file reads/stats and agent naming.
- Keeps tracker support local to Pi instead of introducing a premature shared abstraction.

## Integration Points

- Optional extension: `@ai-devkit/pi-session-tracker` writes `~/.pi/agent/sessions.json`.
- CLI: `ai-devkit agent sessions --type pi` and session detail filtering now validate `pi`.
- Channel bridge: Pi agents can be resolved by the shared `AgentManager` used by channel runner.

## Error Handling

- Missing or malformed `sessions.json` returns an empty tracker map and continues to fallback matching.
- Trusted tracker entries whose session files cannot be parsed re-enter fallback matching before returning process-only agents.
- Missing session root returns process-only agents for running Pi processes.
- Bad JSONL lines are ignored.
- Unparseable sessions that remain unmatched after fallback return process-only agents.

## Performance Considerations

- Tracker matching avoids session scans for exact PID matches.
- Recursive discovery is limited to `.jsonl` files under the Pi sessions root.
- No network calls or external process calls are added.

## Security Notes

- Tracker paths are constrained to the Pi sessions root before reading.
- Session parsing treats all file contents as untrusted and skips malformed records.
- No secrets are read or emitted.

## Verification Evidence

- Red step: `npx nx test agent-manager --runInBand --testPathPattern=PiAdapter.test.ts` failed with missing `PiAdapter.js`.
- Focused adapter: `npx vitest run src/__tests__/adapters/PiAdapter.test.ts` exited 0 with 9 tests passed.
- Package tests: `npx nx run agent-manager:test` exited 0 with 14 files and 394 tests passed.
- Builds: `npx nx run agent-manager:build` and `npx nx run channel-connector:build` exited 0.
- Focused CLI: `npx vitest run src/__tests__/util/sessions.test.ts src/__tests__/commands/agent.test.ts src/__tests__/commands/channel.test.ts` exited 0 with 3 files and 87 tests passed.
- CLI package: `npx nx run cli:test` exited 0 with 54 files and 697 tests passed.
- CLI build: `npx nx run cli:build` exited 0 and built `cli` plus dependent packages.
- Detail regression: `npm run dev -- agent detail --id ai-devkit-25877 --json` exited 0 and returned two Pi conversation messages after rebuilding `agent-manager`.
- Simplification verification: `npx vitest run src/__tests__/adapters/PiAdapter.test.ts`, `npx nx run agent-manager:test`, `npx nx run cli:test`, `npx nx run cli:build`, and live `agent detail --id ai-devkit-25877 --json` all exited 0 after the refactor.

## Phase 6 Implementation Check

- Alignment: implementation matches the requirements and design for `pi` type support, tracker-first matching, legacy fallback, package exports, CLI/channel registration, conversation parsing, and historical sessions.
- Design clarification applied: fallback CWD matching uses encoded Pi project directory names generated from live process CWDs, avoiding lossy decoding of hyphenated path segments.
- No blocking implementation deviations found.
- Remaining validation gap: no live Pi process with `@ai-devkit/pi-session-tracker` was available for manual end-to-end verification.
- Update (2026-06-10): live Pi detail was verified for `ai-devkit-25877` after adding nested Pi message parsing.

## Phase 8 Code Review

- Finding fixed: a trusted tracker entry with an unparseable session file previously returned a process-only agent without attempting legacy matching. `PiAdapter` now sends that process through fallback matching before returning process-only.
- Scope cleanup: README changes are limited to adding Pi support; unrelated Copilot support-table changes were removed.
- Holistic review outcome: no remaining blocking issues found across adapter exports, `AgentType`, CLI registration, session type validation, channel runner registration, docs, and tests.
- Final verification: `npx vitest run src/__tests__/adapters/PiAdapter.test.ts`, `npm run test:coverage --workspace packages/agent-manager`, `npx nx run agent-manager:test`, `npx nx run cli:test`, `npx nx run cli:build`, and `npx ai-devkit@latest lint --feature pi-adapter` all exited 0 after the Phase 8 fix.
