---
phase: planning
title: "Agent Manager Package - Planning"
feature: agent-manager
description: Task breakdown for creating the @ai-devkit/agent-manager package
---

# Planning: @ai-devkit/agent-manager Package

## Milestones

- [x] Milestone 1: Package scaffold and build infrastructure
- [x] Milestone 2: Core code extraction and adaptation
- [x] Milestone 3: Tests and validation

## Task Breakdown

### Phase 1: Package Scaffold

- [x] Task 1.1: Create `packages/agent-manager/` directory structure
  - Create `src/`, `src/adapters/`, `src/terminal/`, `src/utils/`, `src/__tests__/`, `src/__tests__/adapters/`
- [x] Task 1.2: Create `package.json` with proper metadata
  - Name: `@ai-devkit/agent-manager`, version: `0.1.0`
  - Zero runtime dependencies
  - Scripts: build, test, lint, typecheck, clean
  - Exports map for main and sub-paths
- [x] Task 1.3: Create `tsconfig.json` extending `../../tsconfig.base.json`
  - rootDir: `./src`, outDir: `./dist`
  - Exclude: node_modules, dist, `src/__tests__`
- [x] Task 1.4: Create `project.json` for Nx integration
  - Targets: build, test, lint
- [x] Task 1.5: Create `jest.config.js` matching monorepo conventions
  - Preset: ts-jest, testEnvironment: node
  - Coverage thresholds: 80% across branches/functions/lines/statements
- [x] Task 1.6: Create `.eslintrc.json` matching monorepo conventions

### Phase 2: Core Code Extraction

- [x] Task 2.1: Extract `src/adapters/AgentAdapter.ts`
  - Direct copy from `packages/cli/src/lib/adapters/AgentAdapter.ts`
  - No modifications needed
- [x] Task 2.2: Extract `src/utils/file.ts`
  - Direct copy from `packages/cli/src/util/file.ts`
  - No modifications needed
- [x] Task 2.3: Extract `src/utils/process.ts`
  - Copy from `packages/cli/src/util/process.ts`
  - Update import: `ProcessInfo` now from `../adapters/AgentAdapter`
- [x] Task 2.4: Extract `src/AgentManager.ts`
  - Copy from `packages/cli/src/lib/AgentManager.ts`
  - Update import paths: `./adapters/AgentAdapter`
- [x] Task 2.5: Extract `src/adapters/ClaudeCodeAdapter.ts`
  - Copy from `packages/cli/src/lib/adapters/ClaudeCodeAdapter.ts`
  - Update imports: `../../util/process` → `../utils/process`, `../../util/file` → `../utils/file`
- [x] Task 2.6: Extract `src/terminal/TerminalFocusManager.ts`
  - Copy from `packages/cli/src/lib/TerminalFocusManager.ts`
  - Update import: `../util/process` → `../utils/process`
- [x] Task 2.7: Create barrel exports
  - `src/adapters/index.ts` — re-export adapter types and ClaudeCodeAdapter
  - `src/terminal/index.ts` — re-export TerminalFocusManager and types
  - `src/utils/index.ts` — re-export process and file utilities
  - `src/index.ts` — main barrel export for the entire package

### Phase 3: Tests

- [x] Task 3.1: Extract `src/__tests__/AgentManager.test.ts`
  - Copy from `packages/cli/src/__tests__/lib/AgentManager.test.ts`
  - Update import paths
- [x] Task 3.2: Extract `src/__tests__/adapters/ClaudeCodeAdapter.test.ts`
  - Copy from `packages/cli/src/__tests__/lib/adapters/ClaudeCodeAdapter.test.ts`
  - Update import paths
- [x] Task 3.3: Run tests and verify all pass
- [x] Task 3.4: Run build and verify clean compilation
- [x] Task 3.5: Run lint and fix any issues

## Dependencies

- Task 2.1 (AgentAdapter types) must complete before Tasks 2.3, 2.4, 2.5, 2.6
- Task 2.2 (file utils) must complete before Task 2.5 (ClaudeCodeAdapter)
- Task 2.3 (process utils) must complete before Tasks 2.5, 2.6
- Phase 1 must complete before Phase 2
- Phase 2 must complete before Phase 3

## Risks & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Import path mismatches after extraction | Build failures | Careful path mapping; verify with `tsc --noEmit` after each file |
| Test environment differences | Test failures | Run tests early in Phase 3; match jest config to CLI package |
| Missing utility dependencies | Runtime errors | Trace all imports from source files before extraction |

## Resources Needed

- Existing source files in `packages/cli/src/lib/` and `packages/cli/src/util/`
- Existing tests in `packages/cli/src/__tests__/`
- Monorepo configuration files as reference (`packages/memory/` structure)
