---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target: 100% of new/changed code
- Integration test scope: skill commands with merged registries and offline behavior
- End-to-end test scenarios: install/list/remove with custom registries
- Alignment with requirements/design acceptance criteria

## Unit Tests
**What individual components need testing?**

### Registry Resolver / Merge Logic
- [ ] Test case 1: merges default and custom registries into one map
- [ ] Test case 2: custom registry overrides default on ID conflict
- [ ] Additional coverage: empty custom registries fall back to default

### Global Config Manager
- [ ] Test case 1: reads `~/.ai-devkit/.ai-devkit.json` successfully
- [ ] Test case 2: missing or invalid config returns empty registries
- [ ] Additional coverage: malformed JSON handled with clear error

### SkillManager Integration (Unit Level)
- [ ] Test case 1: uses merged registry map for registry lookup
- [ ] Test case 2: falls back to cache when remote registry fetch fails
- [ ] Additional coverage: error messaging for unknown registry ID

## Integration Tests
**How do we test component interactions?**

- [ ] Install a skill from a custom registry repo (via global config registries)
- [ ] Install a skill when default registry is unreachable but cached
- [ ] List skills after installing from custom registry
- [ ] Remove a skill installed from custom registry

## End-to-End Tests
**What user flows need validation?**

- [ ] User configures global registry and installs skill via CLI
- [ ] User lists skills and sees merged results without registry source noise
- [ ] User installs by registry ID when name conflicts across registries

## Test Data
**What data do we use for testing?**

- Sample custom registry repo with at least one valid skill
- Local cache seeded with a known registry for offline tests
- Mock registry JSON for default registry fetch

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Coverage commands and thresholds (`npm run test -- --coverage`)
- Coverage gaps (files/functions below 100% and rationale)
- Manual testing outcomes and sign-off

## Manual Testing
**What requires human validation?**

- Configure global registry in `~/.ai-devkit/.ai-devkit.json`
- Run `ai-devkit skill add <registryId> <skillName>`
- Run `ai-devkit skill list` and confirm seamless UX
- Simulate offline mode and re-run `skill add` using cache

## Performance Testing
**How do we validate performance?**

- Verify no redundant clone operations when cache exists
- Confirm registry fetch happens once per command invocation

## Bug Tracking
**How do we manage issues?**

- Use standard issue labels for registry-related bugs
- Add regression tests for any reported edge case
