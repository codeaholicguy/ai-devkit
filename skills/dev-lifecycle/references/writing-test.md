# Phase 7: Write Tests

Add tests targeting 100% coverage. Reference the latest matching `docs/ai/testing/YYYY-MM-DD-feature-{name}.md`. If none exists, use `docs/ai/testing/feature-{name}.md`. Use success criteria from requirements/design docs.

1. **Gather context** — feature name, changes summary, environment (backend/frontend/full-stack), existing test suites, flaky tests to avoid.
2. **Analyze** the testing template, success criteria, edge cases, available mocks/fixtures.
3. **Unit tests** — cover happy path, edge cases, error handling for each module. Highlight missing branches.
4. **Integration tests** — critical cross-component flows, setup/teardown, boundary/failure cases.
5. **Coverage** — run coverage tooling, identify gaps, suggest additional tests if < 100%.
6. **Update** the selected testing doc with test file links and results.

**Next**: Phase 8 (Code Review). If tests reveal design flaws → back to Phase 3.
