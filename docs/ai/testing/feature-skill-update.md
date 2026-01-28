---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy: Skill Update

## Test Coverage Goals
**What level of testing do we aim for?**

- **Unit test coverage target**: 100% of new/changed code
- **Integration test scope**: Critical paths (update all, update specific, error scenarios)
- **End-to-end test scenarios**: Manual testing with real git repositories
- **Alignment with requirements**: All user stories must have corresponding tests

## Unit Tests
**What individual components need testing?**

### Git Utilities (`util/git.ts`)

#### `isGitRepository(dirPath: string)`
- [ ] **Test: Returns true for git repository**
  - Setup: Create mock directory with `.git` subdirectory
  - Mock: `fs.pathExists` returns true
  - Assert: Function returns true
  
- [ ] **Test: Returns false for non-git directory**
  - Setup: Create mock directory without `.git`
  - Mock: `fs.pathExists` returns false
  - Assert: Function returns false

- [ ] **Test: Handles path with .git file (submodule case)**
  - Setup: Mock directory where `.git` is a file, not directory
  - Mock: `fs.pathExists` returns true
  - Assert: Function returns true (file existence is sufficient)

#### `pullRepository(repoPath: string)`
- [ ] **Test: Successfully pulls repository**
  - Mock: `execAsync` resolves successfully
  - Assert: Function completes without error
  - Verify: `execAsync` called with correct command and options

- [ ] **Test: Throws error on git pull failure**
  - Mock: `execAsync` rejects with error
  - Assert: Function throws error with descriptive message
  - Verify: Error message includes original git error

- [ ] **Test: Respects timeout setting**
  - Mock: `execAsync` with timeout option
  - Verify: Timeout is set to 30000ms
  - Assert: Function uses correct timeout

- [ ] **Test: Uses correct working directory**
  - Mock: `execAsync` with cwd option
  - Verify: cwd is set to provided repoPath
  - Assert: Git command runs in correct directory

### SkillManager (`lib/SkillManager.ts`)

#### `updateRegistry(registryPath: string, registryId: string)`
- [ ] **Test: Updates git repository successfully**
  - Mock: `isGitRepository` returns true
  - Mock: `pullRepository` resolves successfully
  - Assert: Returns UpdateResult with status 'success'
  - Verify: registryId is correct in result

- [ ] **Test: Skips non-git directory**
  - Mock: `isGitRepository` returns false
  - Assert: Returns UpdateResult with status 'skipped'
  - Assert: Message indicates "Not a git repository"
  - Verify: `pullRepository` is not called

- [ ] **Test: Handles git pull error**
  - Mock: `isGitRepository` returns true
  - Mock: `pullRepository` rejects with error
  - Assert: Returns UpdateResult with status 'error'
  - Assert: Error object is preserved in result
  - Assert: Error message is included

#### `updateSkills(registryId?: string)`
- [ ] **Test: Updates all registries when no registryId provided**
  - Mock: Cache directory with multiple registries
  - Mock: `updateRegistry` for each registry
  - Assert: All registries are processed
  - Assert: Summary counts are correct
  - Verify: Progress messages are shown

- [ ] **Test: Updates specific registry when registryId provided**
  - Mock: Cache directory with multiple registries
  - Mock: `updateRegistry` for matching registry only
  - Assert: Only specified registry is processed
  - Assert: Other registries are not touched
  - Verify: Correct registry is updated

- [ ] **Test: Throws error when specific registry not found**
  - Mock: Cache directory without requested registry
  - Assert: Throws error with message about registry not found
  - Verify: No update operations are performed

- [ ] **Test: Handles empty cache directory**
  - Mock: Cache directory doesn't exist
  - Assert: Returns empty summary
  - Assert: Shows "No skills cache found" message
  - Verify: No errors are thrown

- [ ] **Test: Ensures git is installed before updating**
  - Mock: `ensureGitInstalled` to throw error
  - Assert: Error is propagated to caller
  - Verify: No update operations are performed

- [ ] **Test: Collects all results (success, skip, error)**
  - Mock: Cache with 3 registries (1 success, 1 skip, 1 error)
  - Assert: Summary shows 1 successful, 1 skipped, 1 failed
  - Assert: All results are in results array
  - Verify: `displayUpdateSummary` is called

- [ ] **Test: Continues processing after error**
  - Mock: First registry fails, second succeeds
  - Assert: Both registries are processed
  - Assert: Second registry shows success
  - Verify: Error doesn't stop processing

#### `displayUpdateSummary(summary: UpdateSummary)`
- [ ] **Test: Displays success count**
  - Setup: Summary with 2 successful updates
  - Verify: Console shows "✓ 2 updated" in green

- [ ] **Test: Displays skip count**
  - Setup: Summary with 1 skipped registry
  - Verify: Console shows "⊘ 1 skipped" in yellow

- [ ] **Test: Displays error count**
  - Setup: Summary with 1 failed registry
  - Verify: Console shows "✗ 1 failed" in red

- [ ] **Test: Shows detailed error messages**
  - Setup: Summary with error results
  - Verify: Each error is listed with registry ID and message

- [ ] **Test: Provides helpful tips for common errors**
  - Setup: Error with "uncommitted" in message
  - Verify: Tip about running 'git status' is shown
  - Setup: Error with "network" in message
  - Verify: Tip about checking internet connection is shown

## Integration Tests
**How do we test component interactions?**

### CLI Command Integration
- [ ] **Test: `ai-devkit skill update` command exists**
  - Execute: CLI with `skill update --help`
  - Assert: Command is listed and described
  - Verify: Optional registry-id parameter is documented

- [ ] **Test: Updates all registries via CLI**
  - Setup: Test cache with sample registries
  - Execute: `ai-devkit skill update`
  - Assert: All registries are processed
  - Verify: Summary is displayed
  - Verify: Exit code is 0

- [ ] **Test: Updates specific registry via CLI**
  - Setup: Test cache with multiple registries
  - Execute: `ai-devkit skill update test/registry`
  - Assert: Only specified registry is updated
  - Verify: Exit code is 0

- [ ] **Test: Handles git not installed error**
  - Setup: Mock git as not installed
  - Execute: `ai-devkit skill update`
  - Assert: Error message about git installation
  - Verify: Exit code is 1

- [ ] **Test: Handles invalid registry error**
  - Setup: Test cache without requested registry
  - Execute: `ai-devkit skill update nonexistent/registry`
  - Assert: Error message about registry not found
  - Verify: Exit code is 1

### SkillManager + Git Utilities Integration
- [ ] **Test: End-to-end update flow**
  - Setup: Real test git repository in cache
  - Execute: `skillManager.updateSkills()`
  - Assert: Git pull is executed
  - Verify: Repository is updated
  - Verify: Result status is 'success'

- [ ] **Test: Mixed repository types**
  - Setup: Cache with git repo and non-git directory
  - Execute: `skillManager.updateSkills()`
  - Assert: Git repo is updated
  - Assert: Non-git directory is skipped
  - Verify: Summary shows 1 success, 1 skip

- [ ] **Test: Git pull failure handling**
  - Setup: Git repository with uncommitted changes
  - Execute: `skillManager.updateSkills()`
  - Assert: Error is caught and reported
  - Verify: Other registries still process
  - Verify: Summary shows error

## End-to-End Tests
**What user flows need validation?**

### Manual Testing Checklist

- [ ] **User Flow 1: Update all skills (happy path)**
  1. Install 2-3 skills from different registries
  2. Make upstream changes to one registry
  3. Run `ai-devkit skill update`
  4. Verify: Updated registry shows "✓ Updated"
  5. Verify: Unchanged registries show "✓ Updated" (no changes)
  6. Verify: Summary shows correct counts

- [ ] **User Flow 2: Update specific registry**
  1. Install skills from multiple registries
  2. Run `ai-devkit skill update anthropic/skills`
  3. Verify: Only specified registry is updated
  4. Verify: Other registries are not touched
  5. Verify: Summary shows 1 updated

- [ ] **User Flow 3: Handle uncommitted changes**
  1. Install a skill
  2. Manually modify a file in the cached registry
  3. Run `ai-devkit skill update`
  4. Verify: Error is shown for that registry
  5. Verify: Helpful tip about git status is displayed
  6. Verify: Other registries still update

- [ ] **User Flow 4: Handle non-git directory**
  1. Manually create a directory in `~/.ai-devkit/skills/test/manual`
  2. Run `ai-devkit skill update`
  3. Verify: Directory is skipped with message
  4. Verify: No errors are thrown
  5. Verify: Summary shows 1 skipped

- [ ] **User Flow 5: No skills installed**
  1. Clear skill cache directory
  2. Run `ai-devkit skill update`
  3. Verify: Message "No skills cache found"
  4. Verify: No errors
  5. Verify: Exit code is 0

- [ ] **User Flow 6: Network failure**
  1. Disconnect from internet
  2. Run `ai-devkit skill update`
  3. Verify: Timeout error is caught
  4. Verify: Helpful message about network
  5. Verify: Exit code is 0 (errors collected, not thrown)

## Test Data
**What data do we use for testing?**

### Test Fixtures

#### Mock Cache Structure
```
~/.ai-devkit/skills/
├── anthropic/
│   └── skills/
│       └── .git/
├── openai/
│   └── tools/
│       └── .git/
└── test/
    └── manual/
        └── (no .git)
```

#### Mock Git Repositories
- **Success Case**: Clean repository with remote changes
- **Skip Case**: Directory without `.git`
- **Error Case**: Repository with uncommitted changes
- **Timeout Case**: Repository with unreachable remote

### Seed Data Requirements
- Sample skill registries for testing
- Git repositories with known commit history
- Test configuration files

## Test Reporting & Coverage
**How do we verify and communicate test results?**

### Coverage Commands
```bash
# Run all tests with coverage
npm test -- --coverage

# Run only skill update tests
npm test -- SkillManager.test.ts --coverage

# Run git utility tests
npm test -- git.test.ts --coverage
```

### Coverage Thresholds
- **Statements**: 100%
- **Branches**: 100%
- **Functions**: 100%
- **Lines**: 100%

### Coverage Gaps
None expected - all new code should be fully covered.

### Test Reports
- Jest output in terminal
- Coverage report in `coverage/` directory
- CI/CD pipeline test results

## Manual Testing
**What requires human validation?**

### UI/UX Testing Checklist
- [ ] Progress messages are clear and helpful
- [ ] Colors are used appropriately (green/yellow/red)
- [ ] Error messages are actionable
- [ ] Summary is easy to understand
- [ ] Command help text is accurate

### Error Message Validation
- [ ] Git not installed: Clear installation instructions
- [ ] Registry not found: Helpful error message
- [ ] Uncommitted changes: Suggests running git status
- [ ] Network error: Suggests checking connection
- [ ] Timeout: Explains what happened

### Performance Validation
- [ ] Single registry updates in < 5 seconds
- [ ] Multiple registries show progress
- [ ] No hanging or freezing
- [ ] Timeout protection works

## Performance Testing
**How do we validate performance?**

### Load Testing Scenarios
- [ ] **Test: Update 1 registry**
  - Expected: < 5 seconds
  - Measure: Time from start to completion
  
- [ ] **Test: Update 5 registries**
  - Expected: < 25 seconds (5s each)
  - Measure: Total execution time

- [ ] **Test: Update 10 registries**
  - Expected: < 50 seconds
  - Measure: Total execution time
  - Verify: Progress is shown throughout

### Stress Testing
- [ ] **Test: Large repository (100MB+)**
  - Verify: Timeout doesn't trigger prematurely
  - Verify: Memory usage stays reasonable

- [ ] **Test: Slow network**
  - Verify: Timeout protection works
  - Verify: Error is handled gracefully

### Performance Benchmarks
- **Git pull operation**: < 5 seconds per registry (network dependent)
- **Cache directory scan**: < 100ms
- **Result aggregation**: < 10ms
- **Display output**: < 50ms

## Bug Tracking
**How do we manage issues?**

### Issue Tracking Process
1. Create GitHub issue for any bugs found
2. Label with `bug` and `skill-management`
3. Assign to feature developer
4. Link to feature documentation

### Bug Severity Levels
- **Critical**: Feature doesn't work at all
- **High**: Major functionality broken
- **Medium**: Edge case or minor issue
- **Low**: Cosmetic or documentation issue

### Regression Testing Strategy
- Run full test suite before each commit
- Manual testing of all skill commands
- Verify existing commands still work
- Check for breaking changes

### Known Issues / Limitations
- Network-dependent operations may be slow
- Git conflicts require manual resolution
- Timeout set to 30s (may need adjustment)

## Test Execution Plan
**When and how do we run tests?**

### Development Testing
1. Write unit tests alongside code
2. Run tests after each change
3. Verify coverage stays at 100%

### Pre-Commit Testing
1. Run full test suite
2. Run linter
3. Build project
4. Manual smoke test

### CI/CD Testing
1. Automated test run on push
2. Coverage report generation
3. Build verification
4. Integration test execution

### Pre-Release Testing
1. Full manual testing checklist
2. Performance validation
3. Documentation review
4. Cross-platform testing (if applicable)

