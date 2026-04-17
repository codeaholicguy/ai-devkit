---
phase: planning
title: "Gemini CLI Adapter in @ai-devkit/agent-manager - Planning"
feature: gemini-cli-adapter
description: Task plan for adding Gemini CLI adapter support and integrating it into CLI agent commands
---

# Planning: Gemini CLI Adapter in @ai-devkit/agent-manager

## Milestones

- [x] Milestone 1: Research Gemini CLI distribution, session schema, and projectHash algorithm
- [x] Milestone 2: Adapter implementation, package exports, CLI registration, README flip
- [x] Milestone 3: Unit tests + real-Gemini end-to-end verification + maintainer review iteration

## Task Breakdown

### Phase 1: Research & Foundation
- [x] Task 1.1: Investigate Gemini CLI process shape
  - Confirmed Gemini runs as `node /path/to/gemini` (pure Node script), not a native binary
  - `listAgentProcesses('gemini')` returns empty; need `listAgentProcesses('node')` + token-scan filter
- [x] Task 1.2: Reverse-engineer session storage
  - Sessions live at `~/.gemini/tmp/<shortId>/chats/session-*.json`
  - `~/.gemini/projects.json` maps `projectRoot → shortId`
  - Session schema: `{sessionId, projectHash, startTime, lastUpdated, messages, directories, kind}`
- [x] Task 1.3: Confirm `projectHash` algorithm
  - sha256 of project root walked to nearest `.git` boundary
  - Verified against a real session written by Gemini CLI
- [x] Task 1.4: Scaffold adapter + test files following `CodexAdapter` structure

### Phase 2: Core Implementation
- [x] Task 2.1: Implement process detection
  - `isGeminiExecutable(argv)` token-scans for basename matching `gemini`/`gemini.exe`/`gemini.js`
  - Enumerate candidate project roots from cwd walk
- [x] Task 2.2: Implement session parsing and mapping
  - Normalize message `content` through `resolveContent(string | Part[])` helper
  - Prefer `displayContent` over `content` when present
  - Compute status from `lastUpdated` using shared thresholds
- [x] Task 2.3: Register adapter
  - Add to `packages/agent-manager/src/adapters/index.ts` and `src/index.ts`
  - Wire into `packages/cli/src/commands/agent.ts` for list/open paths
- [x] Task 2.4: Flip README "Agent Control Support" matrix for Gemini CLI

### Phase 3: Testing & Review Iteration
- [x] Task 3.1: Unit tests (42 total)
  - Process filtering with mixed `node` processes
  - Session parsing — string content, array content, mixed, missing
  - Status mapping, empty directory handling, malformed JSON
- [x] Task 3.2: End-to-end verification with real Gemini CLI
  - User authenticated and ran a live Gemini chat session
  - Verified `ai-devkit agent list` surfaces the Gemini process with correct cwd/sessionId mapping
- [x] Task 3.3: Address maintainer review feedback
  - Fixed `.trim is not a function` crash on array-shaped user content (introduced `resolveContent` helper + 5 new tests)
  - Reverted earlier Windows-specific basename customization (per maintainer: "đừng custom quá nhiều")
- [x] Task 3.4: Produce docs/ai artifacts per repo `dev-lifecycle` skill

## Dependencies

- Existing `@ai-devkit/agent-manager` adapter contract and utilities
- Existing CLI agent command integration points
- A live Gemini CLI install for end-to-end verification (provided by user auth during review)

## Timeline & Estimates

- Task 1.1–1.4 (research + scaffold): 0.5 day
- Task 2.1–2.4 (implementation): 1.0 day
- Task 3.1–3.4 (tests + E2E + review iteration + docs): 1.0 day
- Total: ~2.5 days across PR iterations

## Risks & Mitigation

- Risk: Gemini CLI session schema may evolve across versions.
  - Mitigation: defensive parsing, tests for partial/malformed fixtures, polymorphic `content` handling.
- Risk: `node` argv scanning is broad and could false-positive on unrelated Node processes.
  - Mitigation: strict token-scan requiring a `gemini`-basename match in argv.
- Risk: `projectHash` algorithm could drift if Gemini CLI changes its boundary-detection logic.
  - Mitigation: walk-to-`.git` fallback to starting directory; verified against live session.
- Risk: Adding a third adapter increases list latency.
  - Mitigation: existing parallel aggregation pattern, bounded file reads, early exits on no live processes.

## Resources Needed

- `CodexAdapter` as implementation template
- Live Gemini CLI session for verification
- Maintainer review cycle on `codeaholicguy/ai-devkit` PR #70

## Progress Summary

Implementation is complete. `GeminiCliAdapter` ships in `@ai-devkit/agent-manager`, is exported through package entry points, and is registered in CLI `list`/`open` flows. Gemini CLI is now ✅ in the README "Agent Control Support" matrix. The maintainer review surfaced one regression (`.trim` on array content) and a suggestion to run the work through the repo's `dev-lifecycle` skill — both addressed. End-to-end verification against a live Gemini CLI session confirmed the mapping between live `node` processes, session files, and `AgentInfo` output.
