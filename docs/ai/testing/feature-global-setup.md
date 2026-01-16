---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
feature: global-setup
---

# Testing Strategy - Global Setup Feature

## Test Coverage Goals
**What level of testing do we aim for?**

- Unit test coverage: 100% of new functions
- Integration test: CLI command with mocked file system
- Manual testing: End-to-end with real Antigravity/Codex environments

## Unit Tests
**What individual components need testing?**

### `src/util/env.ts` - New Functions
- [x] `getGlobalCapableEnvironments()` returns only envs with `globalCommandPath`
- [x] `getGlobalCapableEnvironments()` returns empty array if no envs have global support
- [x] `hasGlobalSupport()` returns true for Antigravity
- [x] `hasGlobalSupport()` returns true for Codex
- [x] `hasGlobalSupport()` returns false for Cursor (no global support)

### `src/lib/EnvironmentSelector.ts` - selectGlobalEnvironments
- [x] Returns empty array if user selects nothing
- [x] Returns only global-capable environments in choices
- [x] Does not show environments without `globalCommandPath`

### `src/lib/TemplateManager.ts` - copyCommandsToGlobal
- [x] Creates global directory if it doesn't exist
- [x] Copies all command files to global folder
- [x] Uses correct file extension for each environment
- [x] Returns list of copied files

### `src/lib/TemplateManager.ts` - checkGlobalCommandsExist
- [x] Returns true if any command file exists in global folder
- [x] Returns false if global folder is empty
- [x] Returns false if global folder doesn't exist

## Integration Tests
**How do we test component interactions?**

- [ ] `setup --global` command shows only Antigravity and Codex as options
- [ ] Full flow: select Antigravity → commands copied to correct path
- [ ] Full flow: select Codex → commands copied to correct path
- [ ] Overwrite prompt shown when files exist
- [ ] Files not overwritten when user declines

## Manual Testing
**What requires human validation?**

### Test Scenario 1: Fresh Global Setup
1. Ensure `~/.gemini/antigravity/global_workflows/` doesn't exist
2. Run `ai-devkit setup --global`
3. Select Antigravity
4. Verify folder created and commands copied

### Test Scenario 2: Overwrite Existing
1. Run global setup once (from Scenario 1)
2. Run `ai-devkit setup --global` again
3. Select Antigravity
4. Verify overwrite prompt appears
5. Decline overwrite → verify files unchanged
6. Accept overwrite → verify files replaced

### Test Scenario 3: Multiple Environments
1. Run `ai-devkit setup --global`
2. Select both Antigravity and Codex
3. Verify commands copied to both locations

### Test Scenario 4: Invalid Environment Filtering
1. Run `ai-devkit setup --global`
2. Verify only Antigravity and Codex appear in selection
3. Verify other environments (Cursor, Claude, etc.) are NOT shown

## Bug Tracking
**How do we manage issues?**

- Use GitHub Issues for bug reports
- Label with `feature:global-setup` for easy filtering
- Include repro steps and expected vs actual behavior
