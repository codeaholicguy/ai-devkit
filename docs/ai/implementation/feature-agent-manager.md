---
phase: implementation
title: "Agent Manager Package - Implementation Guide"
feature: agent-manager
description: Technical implementation notes for the @ai-devkit/agent-manager package
---

# Implementation Guide: @ai-devkit/agent-manager Package

## Development Setup

### Prerequisites
- Node.js >= 16.0.0
- npm (workspaces enabled in root)
- TypeScript 5.3+

### Setup Steps
1. Package directory created at `packages/agent-manager/`
2. Run `npm install` from monorepo root to link workspace
3. Build with `npm run build` from `packages/agent-manager/`

## Code Structure

### Directory Organization
```
src/
├── index.ts                    # Main barrel export
├── AgentManager.ts             # Core orchestrator class
├── adapters/
│   ├── index.ts                # Adapter barrel
│   ├── AgentAdapter.ts         # Interface + types + enums
│   └── ClaudeCodeAdapter.ts    # Claude Code detection
├── terminal/
│   ├── index.ts                # Terminal barrel
│   └── TerminalFocusManager.ts # macOS terminal focus
└── utils/
    ├── index.ts                # Utils barrel
    ├── process.ts              # Process detection
    └── file.ts                 # File reading helpers
```

### Import Path Mapping (CLI → agent-manager)
| CLI Path | Agent Manager Path |
|----------|-------------------|
| `src/lib/AgentManager.ts` | `src/AgentManager.ts` |
| `src/lib/adapters/AgentAdapter.ts` | `src/adapters/AgentAdapter.ts` |
| `src/lib/adapters/ClaudeCodeAdapter.ts` | `src/adapters/ClaudeCodeAdapter.ts` |
| `src/lib/TerminalFocusManager.ts` | `src/terminal/TerminalFocusManager.ts` |
| `src/util/process.ts` | `src/utils/process.ts` |
| `src/util/file.ts` | `src/utils/file.ts` |

### Import Changes Required
- `ClaudeCodeAdapter.ts`: `../../util/process` → `../utils/process`, `../../util/file` → `../utils/file`
- `process.ts`: `../lib/adapters/AgentAdapter` → `../adapters/AgentAdapter`
- `TerminalFocusManager.ts`: `../util/process` → `../utils/process`

## Patterns & Best Practices

- **Adapter pattern**: All agent detection goes through `AgentAdapter` interface
- **Barrel exports**: Each directory has an `index.ts` for clean imports
- **Zero dependencies**: Only Node.js built-ins (fs, path, child_process, util)
- **Graceful degradation**: Adapter failures don't crash the system — partial results returned

## Error Handling

- AgentManager catches adapter errors individually, logs warnings, returns partial results
- File utilities return empty arrays/null on read failures
- Process utilities return empty results when `ps`/`lsof` commands fail
- TerminalFocusManager returns `false`/`null` when terminal can't be found or focused

## Implementation Status

Completed on February 25, 2026 in worktree `feature-agent-manager`.

- Scaffolded `packages/agent-manager/` with `package.json`, `tsconfig.json`, `project.json`, `jest.config.js`, `.eslintrc.json`
- Extracted source files from CLI package into:
  - `src/AgentManager.ts`
  - `src/adapters/AgentAdapter.ts`
  - `src/adapters/ClaudeCodeAdapter.ts`
  - `src/terminal/TerminalFocusManager.ts`
  - `src/utils/process.ts`
  - `src/utils/file.ts`
- Applied import-path updates defined in design/planning docs
- Added barrel exports:
  - `src/index.ts`
  - `src/adapters/index.ts`
  - `src/terminal/index.ts`
  - `src/utils/index.ts`
- Extracted and fixed test imports for:
  - `src/__tests__/AgentManager.test.ts`
  - `src/__tests__/adapters/ClaudeCodeAdapter.test.ts`

Validation:
- `npm run lint` passes
- `npm run typecheck` passes
- `npm run build` passes
- `npm run test` passes (38 tests)

Data-model refinements (February 25, 2026):
- Normalized `AgentType` to code-style values: `claude`, `gemini_cli`, `codex`, `other`
- Removed display-oriented contract elements from package API:
  - Removed `STATUS_CONFIG` and `StatusConfig`
  - Removed `AgentInfo.statusDisplay`
  - Removed `AgentInfo.lastActiveDisplay`
- Updated `ClaudeCodeAdapter` to return data-only fields (`status`, `lastActive`, `summary`) without UI formatting
- Replaced hardcoded string literals with enums where appropriate:
  - Added `TerminalType` enum for terminal location/focus flow
  - Added `SessionEntryType` enum in `ClaudeCodeAdapter` status logic

## Phase 6 Check Implementation (February 25, 2026)

### Alignment Summary

- Overall status: **Mostly aligned**
- Requirements/design coverage: package scaffold, extracted components, API surface, and validations are implemented as specified
- Backward-compatibility non-goal respected: CLI behavior/source was not modified in this feature branch

### File-by-File Verification

- `packages/agent-manager/package.json`
  - Matches package naming/version/scripts/engine constraints from requirements
  - Uses zero runtime dependencies (only devDependencies)
- `packages/agent-manager/tsconfig.json`, `project.json`, `jest.config.js`, `.eslintrc.json`
  - Conform to monorepo conventions and planned targets (build/test/lint/typecheck)
- `packages/agent-manager/src/AgentManager.ts`
  - Adapter orchestration and status-based sorting match design
- `packages/agent-manager/src/adapters/AgentAdapter.ts`
  - Types and interface extracted as designed
- `packages/agent-manager/src/adapters/ClaudeCodeAdapter.ts`
  - Core detection/session/status logic extracted with planned import-path updates
- `packages/agent-manager/src/terminal/TerminalFocusManager.ts`
  - Terminal focus logic extracted with planned import-path updates
- `packages/agent-manager/src/utils/process.ts`, `src/utils/file.ts`
  - Utility extraction and API signatures match design intent
- `packages/agent-manager/src/index.ts` and barrel files
  - Public API exports include core classes/types plus terminal and utils as designed
- `packages/agent-manager/src/__tests__/...`
  - Test files extracted and passing in package context

### Deviations / Risks

1. **Resolved (February 25, 2026)**: Claude adapter tests now mock process/session/history dependencies and no longer rely on local `~/.claude` state or `ps` availability.
2. **Resolved (February 25, 2026)**: Explicit `any` warnings in extracted runtime code were removed by tightening adapter and utility generic typings.

### Phase Decision

- No major implementation/design mismatch detected.
- Proceed to **Phase 8 (Code Review)**.

## Phase 8 Code Review (February 25, 2026)

### Findings

1. **Resolved**: tmux focus command previously used shell interpolation for the target identifier.
   - Updated `TerminalFocusManager.focusTmuxPane()` to use `execFile('tmux', ['switch-client', '-t', identifier])` to avoid shell command injection paths.

2. **Non-blocking follow-up**: coverage threshold enforcement currently depends on running Jest with coverage enabled.
   - Suggested project policy: require `npm run test:coverage` (or equivalent) in CI for this package.

### Review Verdict

- No remaining blocking correctness or security issues in `packages/agent-manager`.
- Feature is ready for commit/PR from a code review perspective.

## Code Review Continuation (February 25, 2026)

### Findings

1. **No new blocking issues** after `AgentType` normalization and display-field removal.
2. **Compatibility note**: this is an intentional contract change for package consumers (type literals and removed display fields/constants).

### Documentation Updates Applied

- Requirements/design docs updated to describe the data-first API boundary.
- Added explicit migration notes for callers formatting status/time displays externally.
