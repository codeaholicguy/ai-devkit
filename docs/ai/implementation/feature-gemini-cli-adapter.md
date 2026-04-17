---
phase: implementation
title: "Gemini CLI Adapter in @ai-devkit/agent-manager - Implementation"
feature: gemini-cli-adapter
description: Implementation notes for Gemini CLI adapter support in the package agent manager and CLI integration
---

# Implementation Guide: Gemini CLI Adapter in @ai-devkit/agent-manager

## Development Setup

- Branch: `feat/gemini-cli-adapter`
- Install dependencies with `npm ci`
- Build + lint + test with:
  - `npx nx run agent-manager:build`
  - `npx nx run agent-manager:lint`
  - `npx nx run agent-manager:test`
  - `npx nx run cli:test -- --runInBand src/__tests__/commands/agent.test.ts`

## Code Structure

- Package adapter implementation:
  - `packages/agent-manager/src/adapters/GeminiCliAdapter.ts`
- Package exports:
  - `packages/agent-manager/src/adapters/index.ts`
  - `packages/agent-manager/src/index.ts`
- CLI wiring:
  - `packages/cli/src/commands/agent.ts`
- Tests:
  - `packages/agent-manager/src/__tests__/adapters/GeminiCliAdapter.test.ts`
  - `packages/cli/src/__tests__/commands/agent.test.ts`
- README matrix update:
  - `README.md` (Agent Control Support row for Gemini CLI)

## Implementation Notes

### Core Features
- Adapter contract: `type = 'gemini'`, plus `canHandle`, `detectAgents`, `getConversation`.
- Process detection: `listAgentProcesses('node')` + `isGeminiExecutable(argv)` token-scan for basename `gemini` / `gemini.exe` / `gemini.js`.
- Project-to-session mapping:
  - Walk from the process cwd to the nearest `.git` boundary (fallback: starting cwd)
  - Compute sha256 of the resolved project root → `projectHash`
  - Cross-check against `~/.gemini/projects.json` for the `shortId` used in the session path
- Session file discovery: `~/.gemini/tmp/<shortId>/chats/session-*.json`, filtered to the matching `projectHash`.
- Content normalization: `resolveContent(content)` accepts `string | Part[]` and returns a concatenated string of `part.text` values; non-text parts are dropped.
- `messageText(entry)` prefers `displayContent` over `content`.

### Patterns & Best Practices
- Follow `CodexAdapter` structure for helper extraction and error handling.
- Keep parsing inside the adapter; keep CLI-side formatting unchanged.
- Fail soft: malformed session entries are skipped; adapter-level exceptions return empty results so other adapters still render.
- Avoid adapter-specific customization the maintainer flagged as unnecessary (e.g., Windows-specific basename handling was reverted).

## Integration Points

- `AgentManager` parallel aggregation across Claude + Codex + Gemini
- `TerminalFocusManager` open/focus flow reused without Gemini-specific branches
- CLI list/json output mapping unchanged

## Error Handling

- Missing `~/.gemini/projects.json` or `~/.gemini/tmp` → empty result, no throw.
- Malformed session JSON → skip that file, continue with the rest.
- Polymorphic `content` → handled by `resolveContent` so `.trim()` never runs on an array.
- Adapter-level throw is caught at the manager layer, isolating the failure.

## Performance Considerations

- Process detection is bounded by the number of live `node` processes on the host.
- Session file reads are scoped to the `shortId` resolved from `projects.json` for each live Gemini process — not a full `~/.gemini/tmp` scan.
- Reuses existing async aggregation model in `AgentManager`.

## Security Notes

- Reads only local files under `~/.gemini` and local process metadata already permitted by existing adapters.
- No external network calls; no execution of user content.

## Implementation Status

- Completed:
  - `packages/agent-manager/src/adapters/GeminiCliAdapter.ts`
  - Package exports in `packages/agent-manager/src/adapters/index.ts` and `src/index.ts`
  - `packages/cli/src/commands/agent.ts` registers `GeminiCliAdapter` for list and open
  - README "Agent Control Support" row for Gemini CLI flipped to ✅
  - Unit tests (42 total) including the 5 added after maintainer review for array-shaped content
- Review-iteration fixes:
  - Introduced `resolveContent(string | Part[])` + `messageText(entry)` helpers to handle Gemini's `Part[]` user content
  - Reverted Windows-specific `path.win32.basename` customization (per "đừng custom quá nhiều")
- Commands verified:
  - `npx nx run-many -t build test lint` ✅
  - `npx nx run agent-manager:test -- --runInBand src/__tests__/adapters/GeminiCliAdapter.test.ts` ✅ (42 passed)
  - End-to-end: real Gemini CLI session surfaced correctly in `ai-devkit agent list`
