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

- [ ] Returns a valid bare-array manifest.
- [ ] Reuses one in-flight/resolved promise across calls.
- [ ] Falls back and warns for network failure.
- [ ] Falls back and warns for non-OK HTTP responses.
- [ ] Falls back and warns for invalid JSON.
- [ ] Rejects non-array, empty-array, blank-name, duplicate-name, and invalid-name manifests as complete responses.

### Consumers

- [ ] `skill add --built-in` installs every name from a mocked runtime list.
- [ ] Setup installs every name from a mocked runtime list for the selected agent.
- [ ] Init adds mocked runtime names when built-ins are selected and does not fetch when skipped.
- [ ] Status passes a mocked runtime list to readiness checks and renders fixture-derived counts.
- [ ] Status uses loader fallback behavior without failing the command.

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
- The current 20 names only in the manifest and loader fallback.
- Mocked successful and failing `Response` objects for loader boundaries.

## Results

Not run yet. Results will be recorded immediately as implementation tasks complete.
