---
phase: testing
title: "Agent Manager Package - Testing Strategy"
feature: agent-manager
description: Testing approach for the @ai-devkit/agent-manager package
---

# Testing Strategy: @ai-devkit/agent-manager Package

## Test Coverage Goals

- Unit test coverage target: 100% of extracted code
- All existing CLI tests for agent code must pass in new package context
- Coverage thresholds: 80% branches, 80% functions, 80% lines, 80% statements

## Unit Tests

### AgentManager (`src/__tests__/AgentManager.test.ts`)
- [x] Adapter registration (single, duplicate, multiple types)
- [x] Adapter unregistration (existing, non-existent)
- [x] Get adapters (empty, populated)
- [x] Has adapter (registered, unregistered)
- [x] List agents (no adapters, single adapter, multiple adapters)
- [x] Agent status sorting (waiting > running > idle > unknown)
- [x] Error handling (adapter failures, all adapters fail)
- [x] Agent resolution (exact match, partial match, ambiguous, no match)
- [x] Adapter count and clear

### ClaudeCodeAdapter (`src/__tests__/adapters/ClaudeCodeAdapter.test.ts`)
- [x] Adapter type and canHandle()
- [x] Agent detection (mocked process/session data)
- [x] Helper methods: truncateSummary(), getRelativeTime(), determineStatus(), generateAgentName()

## Test Data

- Mock adapters implementing `AgentAdapter` interface
- Mock `AgentInfo` objects with configurable overrides
- Tests use Jest mocking for process/session/history dependencies — no real process detection in unit tests

## Test Reporting & Coverage

- Run: `npm run test` from `packages/agent-manager/`
- Coverage: `npm run test -- --coverage`
- Threshold enforcement via jest.config.js `coverageThreshold`

## Execution Results

Executed on February 25, 2026:

- `npm run test` passed
- Total: 44 tests passed, 2 suites passed
- Claude adapter unit tests are deterministic and run without relying on host process permissions
