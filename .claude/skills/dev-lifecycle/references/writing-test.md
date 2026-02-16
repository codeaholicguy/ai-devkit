# Phase 7: Write Tests

Add tests for a feature, targeting 100% coverage.

## Step 1: Gather Context

Ask for:
- Feature name and branch
- Summary of changes (link to design & requirements docs)
- Target environment (backend, frontend, full-stack)
- Existing test suites (unit, integration, E2E)
- Flaky or slow tests to avoid

## Step 2: Analyze Testing Template

- Review `docs/ai/testing/feature-{name}.md` sections (unit, integration, manual, coverage targets)
- Confirm success criteria and edge cases from requirements & design docs
- Note available mocks/stubs or fixtures

## Step 3: Unit Tests (100% Coverage Target)

For each module/function:
1. List behavior scenarios (happy path, edge cases, error handling)
2. Generate concrete test cases with assertions and inputs
3. Reference existing utilities/mocks
4. Provide test code snippets
5. Highlight missing branches preventing full coverage

## Step 4: Integration Tests

1. Identify critical flows spanning multiple components/services
2. Define setup/teardown steps (databases, APIs, queues)
3. Outline test cases for interaction boundaries, data contracts, failure modes
4. Suggest instrumentation/logging for debugging failures

## Step 5: Coverage Strategy

- Recommend tooling commands (e.g., `npm run test -- --coverage`)
- Call out files/functions needing coverage
- Suggest additional tests if coverage < 100%

## Step 6: Manual & Exploratory Testing

- Manual test checklist covering UX, accessibility, error handling
- Exploratory scenarios or chaos/failure injection tests if relevant

## Step 7: Update Documentation

- Summarize tests added or still missing
- Update `docs/ai/testing/feature-{name}.md` with links to test files and results
- Flag follow-up tasks for deferred tests
