---
phase: testing
title: Remote Built-in Skills Manifest Testing
description: Deterministic coverage for remote loading, fallback, and built-in consumers
---

# Remote Built-in Skills Manifest Testing

## Test Coverage Goals

- Cover every new loader branch and all four changed consumer boundaries.
- Mock global fetch in loader tests and mock the loader in consumer tests.
- Preserve deterministic unit and E2E execution with no live manifest requests.

## Unit Tests

### Built-in loader

- [x] Returns a valid bare-array manifest.
- [x] Reuses one in-flight/resolved promise across calls.
- [x] Falls back and warns for network failure.
- [x] Falls back and warns for non-OK HTTP responses.
- [x] Falls back and warns for invalid JSON.
- [x] Rejects non-array, empty-array, blank-name, duplicate-name, and invalid-name manifests as complete responses.

### Consumers

- [x] `skill add --built-in` installs every name from a mocked runtime list.
- [x] Setup installs every name from a mocked runtime list for the selected agent.
- [x] Init adds mocked runtime names when built-ins are selected and does not fetch when skipped.
- [x] Status passes a mocked runtime list to readiness checks and renders fixture-derived counts.
- [x] Status uses loader fallback behavior without failing the command.

## Integration and End-to-End Tests

- [ ] Existing CLI command and service suites pass with deterministic mocks.
- [ ] Search E2E tests for compiled 20-skill assumptions and update any affected assertions.
- [ ] Full E2E suite passes without accessing the live manifest.

## Verification Gates

- [ ] `npm run build`
- [ ] `npm test`
- [ ] `npm run lint`
- [ ] `npx vitest run --config e2e/vitest.config.ts`
- [ ] `npx ai-devkit@latest lint --feature builtin-remote`

## Test Data

- Small fixture lists such as `['remote-one', 'remote-two']` for consumer behavior.
- The current 21 names from the latest base only in the manifest and loader fallback.
- Mocked successful and failing `Response` objects for loader boundaries.

## Results

Focused verification passed 97 tests in seven files. The CLI package build also passed. Full workspace and E2E results remain pending.
