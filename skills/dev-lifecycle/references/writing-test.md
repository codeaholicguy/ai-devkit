# Phase 7: Write Tests

Add tests targeting 100% coverage. Reference `docs/ai/testing/feature-{name}.md` and success criteria from requirements/design docs.

1. **Gather context** — feature name, changes summary, environment (backend/frontend/full-stack), existing test suites, flaky tests to avoid.
2. **Analyze** the testing template, success criteria, edge cases, available mocks/fixtures.
3. **Unit tests** — cover happy path, edge cases, error handling for each module. Highlight missing branches.
4. **Integration tests** — critical cross-component flows, setup/teardown, boundary/failure cases.
5. **Coverage** — run coverage tooling, identify gaps, suggest additional tests if < 100%.
6. **Update** `docs/ai/testing/feature-{name}.md` with test file links and results.

**Next**: Phase 8 (Code Review). If tests reveal design flaws → back to Phase 3.
