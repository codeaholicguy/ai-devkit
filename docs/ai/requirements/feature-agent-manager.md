---
phase: requirements
title: "Agent Manager Package - Requirements"
feature: agent-manager
description: Extract agent detection and management into a standalone @ai-devkit/agent-manager package
---

# Requirements: @ai-devkit/agent-manager Package

## Problem Statement

Agent detection and management code (AgentManager, adapters, process utilities, file utilities) currently lives inside `packages/cli/src/lib/`. This creates several issues:

- **Tight coupling**: The agent detection logic is buried in the CLI package, making it inaccessible to other consumers (MCP servers, web dashboards, other tools)
- **Reusability**: Other packages or external tools cannot import agent detection capabilities without depending on the entire CLI
- **Separation of concerns**: CLI-specific UI code (commands, terminal formatting) is mixed with core domain logic (process detection, session parsing)
- **Testing isolation**: Agent-related tests are interleaved with CLI tests, making it harder to test the core logic independently

## Goals & Objectives

### Primary Goals
- Create a new `@ai-devkit/agent-manager` package at `packages/agent-manager/`
- Extract and enhance core agent detection logic from CLI into the new package
- Export a clean public API for agent detection, adapter registration, and agent resolution
- Include all supporting utilities (process detection, file reading) within the package

### Secondary Goals
- Improve code quality during extraction (better error handling, consistent patterns)
- Include TerminalFocusManager as an optional export (terminal focus capability)
- Maintain backward compatibility — CLI should still function identically after extraction

### Non-Goals
- Modifying the CLI `agent` command behavior or UI (stays in CLI, just re-imports)
- Adding new adapters (Gemini CLI, Codex) in this iteration
- Removing agent code from CLI package (future task — for now, the new package is standalone)
- Creating an MCP server for agent management

## User Stories & Use Cases

1. **As a library consumer**, I want to `import { AgentManager, ClaudeCodeAdapter } from '@ai-devkit/agent-manager'` so that I can detect running AI agents in my own tools.

2. **As a CLI maintainer**, I want agent logic in a separate package so that the CLI can import it as a dependency, keeping the CLI focused on command presentation.

3. **As an adapter author**, I want a clear `AgentAdapter` interface and documented patterns so that I can implement adapters for new agent types (Gemini CLI, Codex, etc.).

4. **As a tool developer**, I want process detection utilities (`listProcesses`, `getProcessCwd`) available as standalone imports so that I can use them independently.

## Success Criteria

- [x] `packages/agent-manager/` exists with proper monorepo setup (package.json, tsconfig, project.json, jest config)
- [x] All core files extracted: `AgentManager`, `AgentAdapter` types, `ClaudeCodeAdapter`, `TerminalFocusManager`, `process` utils, `file` utils
- [x] Package exports a clean public API via `index.ts`
- [x] All existing tests pass in the new package context
- [x] Package builds successfully with `npm run build`
- [x] Package follows existing monorepo conventions (same as `@ai-devkit/memory`)

## Constraints & Assumptions

### Technical Constraints
- Must follow existing monorepo conventions (Nx, npm workspaces, TypeScript)
- Zero runtime dependencies — only Node.js built-ins (fs, path, child_process, util)
- Must support Node.js >= 16.0.0 (matching existing engine requirement)
- Build system: use `tsc` for now (simpler than SWC since no special transforms needed)

### Assumptions
- The CLI package will NOT be modified to import from the new package in this iteration
- TerminalFocusManager is macOS-specific and should be documented as such
- Process detection utilities (`ps aux`, `lsof`) are Unix/macOS-specific

## Questions & Open Items

- **Resolved**: Package name will be `@ai-devkit/agent-manager` (consistent with `@ai-devkit/memory`)
- **Resolved**: TerminalFocusManager will be included in the package as a separate export path
- **Open**: Should we add a `GeminiCLIAdapter` stub/skeleton for future use? (Recommend: no, keep scope minimal)
