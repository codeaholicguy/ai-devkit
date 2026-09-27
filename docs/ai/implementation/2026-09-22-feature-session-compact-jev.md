---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Jev Session Compaction Implementation

## Development Setup

**How do we get started?**

- Worktree: `.worktrees/feature-session-compact-jev` on `feature-session-compact-jev`.
- Install with `npm ci`; build with `npm run build`.
- Runtime Jev access requires `TYPESAFE_API_KEY`. Tests never require a live key.
- Official SDK dependency: `@typesafe-ai/sdk@0.6.0` in the CLI workspace.

## Code Structure

**How is the code organized?**

- `services/session-compact/session-compact.types.ts`: compaction domain types and unavailable constants.
- `services/session-compact/session-compact.service.ts`: local redaction, filtering, assembly, and Markdown rendering.
- `services/session-compact/jev-classifier.ts`: official SDK adapter and typed answer validation.
- `__tests__/services/session-compact/`: network-free service and adapter tests.

## Implementation Notes

**Key technical details to remember:**

### Core Features

- Messages are locally redacted, classified by an eight-worker bounded pool, filtered, and grouped without generative rewriting. Indexed result placement preserves source order.
- Jev asks typed category/importance choice questions and retention/sensitivity noul questions.
- Unknown category or importance labels throw explicit integration errors.

### Patterns & Best Practices

- `SessionEventClassifier` is the only injectable boundary needed by the deterministic service.
- `createJevSessionEventClassifier` constructs the production SDK client with logging disabled.
- Threshold `>= 0.5` converts Jev noul probabilities to keep/sensitive booleans.
- Category/importance labels and both noul probabilities are validated at the SDK boundary; blank optional model configuration normalizes to `jev-latest`.

## Integration Points

**How do pieces connect?**

- `TypeSafeClient.systemOne` uses `jev-latest` unless `TYPESAFE_DEFAULT_MODEL` is configured.
- No database or persistent state is added.
- CLI wiring will pass adapter-normalized `ConversationMessage[]` to `compactSession`.
- `agent session compact --id <id> [--type <provider>] [--format markdown|json]` is registered beside historical session detail.
- The missing-key branch returns before `createAgentManager`, so it cannot list sessions or read a transcript.
- Successful resolution calls `AgentManager.findSessionsById`. Every built-in adapter implements provider-native lookup; optional adapter-method semantics preserve list-and-filter compatibility for external adapters.
- Codex, Claude, Grok, Copilot, Pi, and OpenCode exploit ID-addressable paths or SQL. Gemini metadata does not encode IDs in filenames, so it scans until the exact embedded ID is found without building summaries for later files.

## Error Handling

**How do we handle failures?**

- Missing key will be handled before constructing the SDK client or reading a transcript.
- SDK/API failures propagate through existing CLI error handling; there is no fallback.
- SDK logging is disabled so request bodies cannot be emitted by this feature.

## Performance Considerations

**How do we keep it fast?**

- Classification uses eight concurrent requests; the fixed internal limit keeps the public service contract small.
- Each source message produces exactly one Jev request.

## Security Notes

**What security measures are in place?**

- The API key is passed only to `TypeSafeClient` and never put in Jev state.
- Common bearer tokens, private-key blocks, and secret assignments are redacted locally.
- Jev-sensitive events are excluded from the compact artifact.
- Redaction is defense in depth, not complete DLP.

## Delivered Skill

- `skills/session-compact/SKILL.md` routes long-context, handoff, stale-resume, complex-close, memory-candidate, and task-progress use cases to the CLI.
- It requires agents to report missing `TYPESAFE_API_KEY` clearly and forbids claiming a manual fallback was Jev-backed.
- `skills/built-in.json` and the offline fallback list both include the skill.

## Design Alignment

The implementation now includes the measured performance follow-up: adapter-wide exact-ID lookup and bounded concurrent classification. It adds no persistent index/database state, automatic memory/task mutation, fallback summarizer, or output-file behavior.
