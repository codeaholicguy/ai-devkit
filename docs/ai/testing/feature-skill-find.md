---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target (default: 100% of new/changed code)
- Integration test scope (critical paths + error handling)
- End-to-end test scenarios (key user journeys)
- Alignment with requirements/design acceptance criteria

## Unit Tests
**What individual components need testing?**

### Component/Module 1
- [ ] Test case 1: Parse registry list and handle missing fields
- [ ] Test case 2: Build index entries from registry metadata
- [ ] Additional coverage: TTL refresh decision logic

### Component/Module 2
- [ ] Test case 1: Keyword search matches name and keywords
- [ ] Test case 2: No matches returns empty list and proper exit code
- [ ] Additional coverage: output formatting for multiple registries

## Integration Tests
**How do we test component interactions?**

- [ ] Integration scenario 1: `skill find` with warm index
- [ ] Integration scenario 2: `skill find` triggers index refresh
- [ ] Integration scenario 4: `SKILL.md` description fetch included in index
- [ ] API endpoint tests
- [ ] Integration scenario 3 (failure mode / rollback): registry fetch fails, stale index used

## End-to-End Tests
**What user flows need validation?**

- [ ] User flow 1: Search keyword returns list of skills
- [ ] User flow 2: Search keyword yields no matches
- [ ] Critical path testing
- [ ] Regression of adjacent features

## Test Data
**What data do we use for testing?**

- Test fixtures and mocks
  - Mock registry list and mock metadata responses
- Seed data requirements
  - Example registry with `skills/` containing sample skills
- Test database setup
  - Not required

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Coverage commands and thresholds (`npm run test -- --coverage`)
- Coverage gaps (files/functions below 100% and rationale)
- Links to test reports or dashboards
- Manual testing outcomes and sign-off

## Manual Testing
**What requires human validation?**

- UI/UX testing checklist (include accessibility)
  - CLI output readability and formatting
- Browser/device compatibility
  - Not applicable
- Smoke tests after deployment
  - Run `npx ai-devkit@latest skill find typescript`

## Performance Testing
**How do we validate performance?**

- Load testing scenarios
  - Large registry list with thousands of skills
- Stress testing approach
  - Repeated searches with refresh disabled
- Performance benchmarks
  - Search under 2s with warm index

## Bug Tracking
**How do we manage issues?**

- Issue tracking process
  - Use repo issues with repro steps
- Bug severity levels
  - Blocker, major, minor, cosmetic
- Regression testing strategy
  - Re-run integration tests after changes

