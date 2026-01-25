---
description: Add tests for a new feature.
---

Review `docs/ai/testing/feature-{name}.md` and ensure it mirrors the base template before writing tests.

## Step 1: Gather Context
Ask me for:
- Feature name and branch
- Summary of what changed (link to design & requirements docs)
- Target environment (backend, frontend, full-stack)
- Existing automated test suites (unit, integration, E2E)
- Any flaky or slow tests to avoid

## Step 2: Analyze Testing Template
- Identify required sections from `docs/ai/testing/feature-{name}.md` (unit, integration, manual verification, coverage targets)
- Confirm success criteria and edge cases from requirements & design docs
- Note any mocks/stubs or fixtures already available

## Step 3: Unit Tests (Aim for 100% coverage)
For each module/function:
1. List behavior scenarios (happy path, edge cases, error handling)
2. Generate concrete test cases with assertions and inputs
3. Reference existing utilities/mocks to accelerate implementation
4. Provide pseudocode or actual test snippets
5. Highlight potential missing branches preventing full coverage

## Step 4: Integration Tests
1. Identify critical flows that span multiple components/services
2. Define setup/teardown steps (databases, APIs, queues)
3. Outline test cases validating interaction boundaries, data contracts, and failure modes
4. Suggest instrumentation/logging to debug failures

## Step 5: Coverage Strategy
- Recommend tooling commands (e.g., `npm run test -- --coverage`)
- Call out files/functions that still need coverage and why
- Suggest additional tests if coverage <100%

## Step 6: Manual & Exploratory Testing
- Propose manual test checklist covering UX, accessibility, and error handling
- Identify exploratory scenarios or chaos/failure injection tests if relevant

## Step 7: Update Documentation & TODOs
- Summarize which tests were added or still missing
- Update `docs/ai/testing/feature-{name}.md` sections with links to test files and results
- Flag follow-up tasks for deferred tests (with owners/dates)

Let me know when you have the latest code changes ready; we'll write tests together until we hit 100% coverage.
