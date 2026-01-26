---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Milestones
**What are the major checkpoints?**

- [ ] Milestone 1: Global registry config support and merge logic
- [ ] Milestone 2: Skill commands updated and tested
- [ ] Milestone 3: Documentation and testing finalized

## Task Breakdown
**What specific work needs to be done?**

### Phase 1: Foundation
- [x] Task 1.1: Define global config schema for `skills.registries` (Notes: aligned requirements/design docs)
- [x] Task 1.2: Add global config manager for `~/.ai-devkit/.ai-devkit.json` (Notes: new `GlobalConfigManager` added)
- [x] Task 1.3: Update types to include optional `skills.registries` (Notes: added `GlobalDevKitConfig` with `skills.registries`)

### Phase 2: Core Features
- [x] Task 2.1: Implement registry merge logic (custom overrides default) (Notes: merge in `SkillManager` with custom override)
- [x] Task 2.2: Update `SkillManager` to use merged registries for all commands (Notes: addSkill now uses merged registries)
- [x] Task 2.3: Ensure offline behavior uses cached registries when remote fetch fails (Notes: cached repo used if URL missing)

### Phase 3: Integration & Polish
- [x] Task 3.1: Add unit tests for registry merging and config parsing (Notes: added GlobalConfig + SkillManager tests)
- [x] Task 3.2: Add integration tests for skill commands with custom registries (Notes: added SkillManager test using real global config)
- [x] Task 3.3: Update docs and finalize testing notes (Notes: updated requirements, implementation, testing docs)

## Dependencies
**What needs to happen in what order?**

- Global config schema and manager must be in place before skill command updates.
- Merge logic should be implemented before modifying command behavior.
- Tests depend on updated `SkillManager` behavior and new config handling.

## Timeline & Estimates
**When will things be done?**

- Phase 1: 0.5-1 day
- Phase 2: 1-2 days
- Phase 3: 0.5-1 day

## Risks & Mitigation
**What could go wrong?**

- Registry conflicts cause unexpected behavior → enforce clear override rules.
- Remote registry fetch failure breaks commands → fallback to cache and log.
- Config path ambiguity → document and test explicit path.

## Resources Needed
**What do we need to succeed?**

- Access to a sample custom registry repo for testing
- Git installed and available in CI/dev environments
- Updated documentation and test templates
