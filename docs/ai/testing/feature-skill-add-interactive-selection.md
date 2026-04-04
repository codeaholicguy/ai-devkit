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
- [ ] Test case 1: Omitting `skillName` triggers registry enumeration and prompt selection.
- [ ] Test case 2: Providing `skillName` skips the prompt entirely.
- [ ] Test case 3: Invalid registry throws before prompt.
- [ ] Test case 4: Empty registry throws a clear error.
- [ ] Test case 5: Non-interactive mode without `skillName` throws a clear error.
- [ ] Test case 6: Prompt cancellation exits without config writes or installs.

### Skill Command
- [ ] Test case 1: `skill add <registry>` is parsed successfully.
- [ ] Test case 2: `skill add <registry> <skill-name>` still forwards both args correctly.
- [ ] Test case 3: Help text reflects the interactive shorthand.

## Integration Tests
**How do we test component interactions?**

- [ ] Registry cache is prepared before enumeration.
- [ ] Selected skill flows into the existing install path and config update.
- [ ] Global install options still work after interactive selection.

## End-to-End Tests
**What user flows need validation?**

- [ ] User flow 1: Install a skill from a registry by selecting from the prompt.
- [ ] User flow 2: Install a known skill directly with two arguments.
- [ ] User flow 3: Cancel out of the prompt with no side effects.

## Test Data
**What data do we use for testing?**

- Mock registry repositories with valid `skills/<name>/SKILL.md` folders.
- One malformed skill directory fixture to verify skip behavior.
- Mocked prompt responses for selection and cancellation.

## Test Reporting & Coverage
**How do we verify and communicate test results?**

- Run focused Jest suites for `commands/skill` and `lib/SkillManager`.
- Confirm changed branches include prompt, no-prompt, and error paths.

## Manual Testing
**What requires human validation?**

- Prompt readability when many skills are present.
- Cancellation UX in a real terminal session.
- Global vs project install messaging after selection.

## Performance Testing
**How do we validate performance?**

- Ensure registry enumeration remains acceptable for registries with many skill folders.

## Bug Tracking
**How do we manage issues?**

- Record any direct-install regressions as blockers because they affect existing scripted usage.
