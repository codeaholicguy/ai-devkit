---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
feature: skill-add-interactive-selection
---

# Testing Strategy - Skill Add Interactive Selection

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage target: 100% of new or changed logic in `SkillManager` and command parsing.
- Integration scope: interactive add flow, explicit add flow, and failure cases.
- End-to-end scope: optional later validation through the packaged CLI if command-level tests are insufficient.

## Unit Tests
**What individual components need testing?**

### SkillManager
- [x] Test case 1: Omitting `skillName` triggers registry enumeration and prompt selection.
- [x] Test case 2: Providing `skillName` skips the prompt entirely.
- [x] Test case 3: Invalid registry throws before prompt.
- [x] Test case 4: Empty registry throws a clear error.
- [x] Test case 5: Non-interactive mode without `skillName` throws a clear error.
- [x] Test case 6: Prompt cancellation exits without config writes or installs.
- [x] Test case 7: Multi-selection installs more than one skill in a single run.
- [x] Test case 8: Cached registry contents are used when refresh fails.
- [x] Test case 9: Global installation still works after interactive multi-selection.

### Skill Command
- [x] Test case 1: `skill add <registry>` is parsed successfully.
- [x] Test case 2: `skill add <registry> <skill-name>` still forwards both args correctly.
- [x] Test case 3: Cancellation is surfaced as a warning instead of an error exit.
- [x] Test case 4: Command shape reflects the optional `[skill-name]` argument.

## Integration Tests
**How do we test component interactions?**

- [x] Registry cache is prepared before enumeration.
- [x] Selected skill flows into the existing install path and config update.
- [x] Global install options still work after interactive selection.

## End-to-End Tests
**What user flows need validation?**

- [x] User flow 1: Install skill(s) from a registry by selecting from the prompt.
- [x] User flow 2: Install a known skill directly with two arguments.
- [x] User flow 3: Cancel out of the prompt with no side effects.

## Test Data
**What data do we use for testing?**

- Mock registry repositories with valid `skills/<name>/SKILL.md` folders.
- One malformed skill directory fixture to verify skip behavior.
- Mocked prompt responses for selection and cancellation.
- TTY stubs for interactive vs non-interactive command behavior.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Run focused Jest suites for `commands/skill` and `lib/SkillManager`.
- Confirm changed branches include prompt, no-prompt, and error paths.
- Latest verification evidence:
  - `npm test -- skill.test.ts`
  - `npm test -- SkillManager.test.ts`
  - `npx ai-devkit@latest lint --feature skill-add-interactive-selection`
- Remaining coverage gap:
  - no command-level assertion for full rendered help output text; current coverage checks the registered argument shape instead

## Manual Testing
**What requires human validation?**

- Prompt readability when many skills are present.
- Cancellation UX in a real terminal session.
- Global vs project install messaging after selection.
- Checkbox prompt usability when only one skill is available.

## Performance Testing
**How do we validate performance?**

- Ensure registry enumeration remains acceptable for registries with many skill folders.

## Bug Tracking
**How do we manage issues?**

- Record any direct-install regressions as blockers because they affect existing scripted usage.
