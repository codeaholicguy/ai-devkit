---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy: Skill Management

## Test Coverage Goals
**What level of testing do we aim for?**

- **Unit test coverage target**: 100% of new code (all services and utilities)
- **Integration test scope**: End-to-end skill operations (add, remove, update, list)
- **End-to-end test scenarios**: Complete user workflows from CLI
- **Alignment with requirements**: Each user story has corresponding test cases

## Unit Tests
**What individual components need testing?**

### RegistryService (`src/lib/RegistryService.test.ts`)

- [ ] **Test: fetchRegistry() with valid cache**
  - Given: Valid cached registry file less than 24 hours old
  - When: fetchRegistry() is called
  - Then: Returns cached registry without network request
  - Coverage: Cache hit path

- [ ] **Test: fetchRegistry() with expired cache**
  - Given: Cached registry file older than 24 hours
  - When: fetchRegistry() is called
  - Then: Fetches fresh registry from GitHub and updates cache
  - Coverage: Cache miss + network fetch path

- [ ] **Test: fetchRegistry() with network failure falls back to cache**
  - Given: Network request fails but valid cache exists
  - When: fetchRegistry() is called
  - Then: Returns cached registry with warning
  - Coverage: Error handling, fallback logic

- [ ] **Test: fetchRegistry() with no cache and network failure**
  - Given: No cached registry and network request fails
  - When: fetchRegistry() is called
  - Then: Throws error with helpful message
  - Coverage: Error handling, no fallback available

- [ ] **Test: getRegistryEntry() finds verified registry**
  - Given: Registry contains entry for "anthropics/skills"
  - When: getRegistryEntry("anthropics/skills") is called
  - Then: Returns matching RegistryEntry with verified: true
  - Coverage: Registry lookup, verified entries

- [ ] **Test: getRegistryEntry() returns null for unknown registry**
  - Given: Registry does not contain "unknown/repo"
  - When: getRegistryEntry("unknown/repo") is called
  - Then: Returns null
  - Coverage: Registry lookup miss

- [ ] **Test: isVerified() checks registry verification status**
  - Given: Registry entry with verified: true
  - When: isVerified("anthropics/skills") is called
  - Then: Returns true
  - Coverage: Verification check

- [ ] **Test: validateRegistry() accepts valid schema**
  - Given: Registry JSON with correct structure
  - When: validateRegistry() is called
  - Then: No error is thrown
  - Coverage: Schema validation success

- [ ] **Test: validateRegistry() rejects invalid schema**
  - Given: Registry JSON with missing required fields
  - When: validateRegistry() is called
  - Then: Throws validation error with details
  - Coverage: Schema validation failure

### CacheManager (`src/lib/CacheManager.test.ts`)

- [ ] **Test: ensureSkillCached() clones new repository**
  - Given: Repository not in cache
  - When: ensureSkillCached() is called
  - Then: Clones repository to ~/.ai-devkit/skills/ and returns skill path
  - Coverage: First-time cache population

- [ ] **Test: ensureSkillCached() uses existing cache**
  - Given: Repository already cloned in cache
  - When: ensureSkillCached() is called
  - Then: Returns skill path without cloning
  - Coverage: Cache hit, skip clone

- [ ] **Test: ensureSkillCached() validates skill structure**
  - Given: Cached repository exists but skill missing SKILL.md
  - When: ensureSkillCached() is called
  - Then: Throws error "Invalid skill: SKILL.md not found"
  - Coverage: Skill validation

- [ ] **Test: ensureSkillCached() throws if skill not in repo**
  - Given: Repository cached but skill name doesn't exist
  - When: ensureSkillCached() is called with non-existent skill
  - Then: Throws error "Skill 'xyz' not found in registry"
  - Coverage: Skill existence check

- [ ] **Test: getSkillPath() resolves verified registry path**
  - Given: Skill exists in verified registry cache
  - When: getSkillPath("anthropics/skills", "frontend-design") is called
  - Then: Returns correct absolute path
  - Coverage: Path resolution for verified registries

- [ ] **Test: getSkillPath() resolves untrusted registry path**
  - Given: Skill exists in untrusted registry cache
  - When: getSkillPath("untrusted/repo", "skill") is called
  - Then: Returns path under ~/.ai-devkit/skills/untrusted/
  - Coverage: Path resolution for untrusted registries

- [ ] **Test: listCachedSkills() enumerates skills**
  - Given: Registry cache with multiple skill directories
  - When: listCachedSkills("anthropics/skills") is called
  - Then: Returns array of skill names
  - Coverage: Cache enumeration

- [ ] **Test: clearCache() removes registry cache**
  - Given: Cached registry exists
  - When: clearCache("anthropics/skills") is called
  - Then: Cache directory is removed
  - Coverage: Cache cleanup

### GitService (`src/lib/GitService.test.ts`)

- [ ] **Test: cloneRepo() successfully clones repository**
  - Given: Valid GitHub URL
  - When: cloneRepo() is called
  - Then: Repository is cloned to target path
  - Coverage: Successful clone operation

- [ ] **Test: cloneRepo() with custom branch**
  - Given: Repository with multiple branches
  - When: cloneRepo() is called with branch: "develop"
  - Then: Clones specified branch
  - Coverage: Branch specification

- [ ] **Test: cloneRepo() handles network errors**
  - Given: Network unavailable
  - When: cloneRepo() is called
  - Then: Throws error with helpful message
  - Coverage: Network error handling

- [ ] **Test: cloneRepo() handles invalid URLs**
  - Given: Malformed git URL
  - When: cloneRepo() is called
  - Then: Throws validation error
  - Coverage: Input validation

- [ ] **Test: pullRepo() updates existing repository**
  - Given: Repository with outdated clone
  - When: pullRepo() is called
  - Then: Pulls latest changes
  - Coverage: Repository update

- [ ] **Test: getCommitHash() returns current commit**
  - Given: Cloned repository
  - When: getCommitHash() is called
  - Then: Returns SHA hash of HEAD commit
  - Coverage: Version tracking

### InstallationService (`src/lib/InstallationService.test.ts`)

- [ ] **Test: installSkill() copies files successfully**
  - Given: Skill in cache, method: "copy"
  - When: installSkill() is called
  - Then: Files are copied to target directories
  - Coverage: Copy installation

- [ ] **Test: installSkill() creates symlinks successfully**
  - Given: Skill in cache, method: "symlink", OS supports symlinks
  - When: installSkill() is called
  - Then: Symlinks are created in target directories
  - Coverage: Symlink installation

- [ ] **Test: installSkill() falls back to copy on Windows without symlink support**
  - Given: Windows OS without developer mode
  - When: installSkill() is called with method: "symlink"
  - Then: Falls back to copy with warning
  - Coverage: Symlink fallback

- [ ] **Test: installSkill() creates target directories**
  - Given: Target directories don't exist
  - When: installSkill() is called
  - Then: Creates .cursor/skills/ and .claude/skills/ directories
  - Coverage: Directory creation

- [ ] **Test: installSkill() removes existing installation**
  - Given: Skill already installed
  - When: installSkill() is called
  - Then: Removes old installation before installing new
  - Coverage: Reinstallation

- [ ] **Test: getInstallationTargets() resolves cursor environment**
  - Given: Config with environments: ["cursor"]
  - When: getInstallationTargets() is called
  - Then: Returns [".cursor/skills"]
  - Coverage: Target resolution

- [ ] **Test: getInstallationTargets() resolves multiple environments**
  - Given: Config with environments: ["cursor", "claude"]
  - When: getInstallationTargets() is called
  - Then: Returns [".cursor/skills", ".claude/skills"]
  - Coverage: Multiple target resolution

- [ ] **Test: uninstallSkill() removes copied files**
  - Given: Skill installed via copy
  - When: uninstallSkill() is called
  - Then: Removes skill directory from target
  - Coverage: Copy removal

- [ ] **Test: uninstallSkill() removes symlinks**
  - Given: Skill installed via symlink
  - When: uninstallSkill() is called
  - Then: Removes symlink from target
  - Coverage: Symlink removal

### ConfigManager Extensions (`src/lib/ConfigManager.test.ts`)

- [ ] **Test: readProjectConfig() loads .ai-devkit.json**
  - Given: Valid .ai-devkit.json exists
  - When: readProjectConfig() is called
  - Then: Returns parsed config object
  - Coverage: Config loading

- [ ] **Test: ensureProjectConfig() creates config if missing**
  - Given: No .ai-devkit.json exists
  - When: ensureProjectConfig() is called
  - Then: Prompts user and creates config file
  - Coverage: Config initialization

- [ ] **Test: readUserConfig() loads ~/.ai-devkit/config.json**
  - Given: User config exists
  - When: readUserConfig() is called
  - Then: Returns user preferences
  - Coverage: User config loading

- [ ] **Test: updateUserConfig() saves preferences**
  - Given: User config exists
  - When: updateUserConfig({ installMethod: 'symlink' }) is called
  - Then: Updates config file with new values
  - Coverage: Preference persistence

### Validation Utilities (`src/util/validation.test.ts`)

- [ ] **Test: validateRegistryId() accepts valid format**
  - Given: Registry ID "anthropics/skills"
  - When: validateRegistryId() is called
  - Then: No error is thrown
  - Coverage: Valid input

- [ ] **Test: validateRegistryId() rejects path traversal**
  - Given: Registry ID "../malicious"
  - When: validateRegistryId() is called
  - Then: Throws error "Invalid characters"
  - Coverage: Security validation

- [ ] **Test: validateSkillName() accepts valid names**
  - Given: Skill name "frontend-design"
  - When: validateSkillName() is called
  - Then: No error is thrown
  - Coverage: Valid skill names

- [ ] **Test: validateSkillName() rejects uppercase**
  - Given: Skill name "Frontend-Design"
  - When: validateSkillName() is called
  - Then: Throws error
  - Coverage: Name format validation

- [ ] **Test: validateGitUrl() accepts GitHub HTTPS URLs**
  - Given: URL "https://github.com/anthropics/skills.git"
  - When: validateGitUrl() is called
  - Then: No error is thrown
  - Coverage: URL validation

- [ ] **Test: validateGitUrl() rejects non-GitHub URLs**
  - Given: URL "https://malicious.com/repo.git"
  - When: validateGitUrl() is called
  - Then: Throws error
  - Coverage: Security validation

## Integration Tests
**How do we test component interactions?**

### End-to-End Skill Installation (`tests/integration/skill-add.test.ts`)

- [ ] **Test: Add skill from verified registry**
  - Setup: Clean test environment, mock GitHub
  - When: Run `ai-devkit skill add anthropics/skills frontend-design`
  - Then: 
    - Registry is fetched and cached
    - Repository is cloned to cache
    - Skill is copied/linked to project
    - Manifest is updated
  - Coverage: Complete add workflow

- [ ] **Test: Add skill from unverified registry with confirmation**
  - Setup: Clean test environment
  - When: Run `ai-devkit skill add unknown/repo custom-skill`
  - Then:
    - Warning is displayed
    - User is prompted for confirmation
    - Skill is installed after confirmation
  - Coverage: Untrusted registry flow

- [ ] **Test: Add skill without .ai-devkit.json**
  - Setup: Project without config file
  - When: Run `ai-devkit skill add anthropics/skills frontend-design`
  - Then:
    - Prompts user for environments
    - Creates .ai-devkit.json
    - Installs skill
  - Coverage: First-time setup

- [ ] **Test: Add skill with --method symlink**
  - Setup: Clean environment
  - When: Run `ai-devkit skill add anthropics/skills frontend-design --method symlink`
  - Then: Skill is symlinked (not copied)
  - Coverage: Symlink installation

- [ ] **Test: Add skill that's already cached**
  - Setup: Repository already cloned in cache
  - When: Run `ai-devkit skill add anthropics/skills another-skill`
  - Then: Uses cached repo, doesn't re-clone
  - Coverage: Cache reuse

### Skill Removal (`tests/integration/skill-remove.test.ts`)

- [ ] **Test: Remove installed skill**
  - Setup: Skill already installed
  - When: Run `ai-devkit skill remove frontend-design`
  - Then:
    - Skill is removed from target directories
    - Manifest is updated
  - Coverage: Basic removal

- [ ] **Test: Remove skill with --all flag**
  - Setup: Skill installed in multiple environments
  - When: Run `ai-devkit skill remove frontend-design --all`
  - Then: Skill removed from all environments
  - Coverage: Multi-environment removal

- [ ] **Test: Remove non-existent skill**
  - Setup: Skill not installed
  - When: Run `ai-devkit skill remove non-existent`
  - Then: Shows error message
  - Coverage: Error handling

### Skill Listing (`tests/integration/skill-list.test.ts`)

- [ ] **Test: List installed skills**
  - Setup: Multiple skills installed
  - When: Run `ai-devkit skill list`
  - Then: Displays table with skill name, registry, method, environments
  - Coverage: Basic listing

- [ ] **Test: List with --format json**
  - Setup: Skills installed
  - When: Run `ai-devkit skill list --format json`
  - Then: Outputs JSON array of skill objects
  - Coverage: JSON output format

- [ ] **Test: List with no skills installed**
  - Setup: No skills installed
  - When: Run `ai-devkit skill list`
  - Then: Shows "No skills installed" message
  - Coverage: Empty state

### Skill Search (`tests/integration/skill-search.test.ts`)

- [ ] **Test: Search for skills by keyword**
  - Setup: Registry with multiple skills
  - When: Run `ai-devkit skill search frontend`
  - Then: Shows matching skills from all registries
  - Coverage: Basic search

- [ ] **Test: Search with --registry filter**
  - Setup: Multiple registries
  - When: Run `ai-devkit skill search design --registry anthropics/skills`
  - Then: Shows only skills from specified registry
  - Coverage: Filtered search

### Skill Update (`tests/integration/skill-update.test.ts`)

- [ ] **Test: Update specific skill**
  - Setup: Skill installed, updates available in repo
  - When: Run `ai-devkit skill update frontend-design`
  - Then:
    - Pulls latest changes from git
    - Reinstalls skill
    - Updates version in manifest
  - Coverage: Single skill update

- [ ] **Test: Update all skills**
  - Setup: Multiple skills installed
  - When: Run `ai-devkit skill update --all`
  - Then: Updates all skills to latest versions
  - Coverage: Bulk update

## End-to-End Tests
**What user flows need validation?**

### User Flow 1: First-Time User Installing First Skill
- [ ] **Scenario**: New project, no .ai-devkit.json, no cache
  - Step 1: Run `ai-devkit skill add anthropics/skills frontend-design`
  - Step 2: CLI prompts for environments → User selects "both"
  - Step 3: CLI prompts for install method → User selects "symlink"
  - Step 4: CLI fetches registry
  - Step 5: CLI clones anthropics/skills repository
  - Step 6: CLI creates .cursor/skills/ and .claude/skills/
  - Step 7: CLI symlinks skill to both directories
  - Step 8: CLI creates .ai-devkit.json and .ai-devkit/skills.json
  - Expected: Skill is installed, configs created, success message displayed

### User Flow 2: Installing Multiple Skills from Same Registry
- [ ] **Scenario**: Add two skills from anthropics/skills
  - Step 1: Run `ai-devkit skill add anthropics/skills frontend-design`
  - Step 2: Skill is installed (repo cloned)
  - Step 3: Run `ai-devkit skill add anthropics/skills data-analysis`
  - Step 4: Second skill installed using cached repo (no re-clone)
  - Expected: Both skills installed, repo cloned only once

### User Flow 3: Removing and Reinstalling a Skill
- [ ] **Scenario**: Remove skill, then add it back
  - Step 1: Skill is already installed
  - Step 2: Run `ai-devkit skill remove frontend-design`
  - Step 3: Skill removed, manifest updated
  - Step 4: Run `ai-devkit skill add anthropics/skills frontend-design --force`
  - Step 5: Skill reinstalled (using cache)
  - Expected: Skill successfully removed and reinstalled

### User Flow 4: Installing Untrusted Skill with Warning
- [ ] **Scenario**: Install from unverified registry
  - Step 1: Run `ai-devkit skill add private-org/skills custom-skill`
  - Step 2: Warning displayed about unverified registry
  - Step 3: User confirms installation
  - Step 4: Skill cloned to ~/.ai-devkit/skills/untrusted/
  - Step 5: Skill installed to project
  - Expected: Clear warnings, user confirmation, successful installation

### User Flow 5: Switching from Copy to Symlink
- [ ] **Scenario**: Reinstall skill with different method
  - Step 1: Skill installed via copy
  - Step 2: Run `ai-devkit skill add anthropics/skills frontend-design --method symlink --force`
  - Step 3: Copied files removed
  - Step 4: Symlinks created
  - Expected: Installation method changed, manifest updated

## Test Data
**What data do we use for testing?**

### Mock Registry File
```json
{
  "version": "1.0.0",
  "registries": [
    {
      "id": "anthropics/skills",
      "name": "Anthropic Skills",
      "description": "Official skills from Anthropic",
      "url": "https://github.com/anthropics/skills.git",
      "verified": true
    },
    {
      "id": "test-org/test-skills",
      "name": "Test Skills",
      "description": "Test repository for integration tests",
      "url": "https://github.com/test-org/test-skills.git",
      "verified": true
    }
  ]
}
```

### Mock Skill Structure
```
test-skills/
├── SKILL.md
├── scripts/
│   └── test.sh
└── references/
    └── REFERENCE.md
```

### Test Fixtures
- Mock GitHub responses for registry fetch
- Sample skill repositories (small, fast to clone)
- Mock user inputs for prompts
- Temporary test directories (cleaned up after tests)

## Test Reporting & Coverage
**How do we verify and communicate test results?**

### Coverage Commands
```bash
# Run all tests with coverage
npm run test -- --coverage --workspace=packages/cli

# Run specific test suite
npm run test -- RegistryService.test.ts --workspace=packages/cli

# Watch mode for development
npm run test -- --watch --workspace=packages/cli
```

### Coverage Thresholds
Set in `packages/cli/jest.config.js`:
```javascript
module.exports = {
  coverageThreshold: {
    global: {
      branches: 100,
      functions: 100,
      lines: 100,
      statements: 100
    }
  }
};
```

### Coverage Gaps
Track any exceptions to 100% coverage:
- **None expected**: Aim for 100% coverage of all new code
- If gaps exist, document rationale here

### Manual Testing Checklist
- [ ] Install skill on macOS
- [ ] Install skill on Linux
- [ ] Install skill on Windows (with and without developer mode)
- [ ] Test with slow network (simulate with network throttling)
- [ ] Test with no network (offline mode for list/remove)
- [ ] Test with large repository (slow clone)
- [ ] Test symlink creation on Windows without admin rights
- [ ] Test with corrupted cache directory
- [ ] Test concurrent skill installations (race conditions)

### Integration Test Environment
- Use temporary directories for all file operations
- Mock GitHub API responses to avoid rate limits
- Use small test repositories for fast clones
- Clean up test data after each test
- Isolate tests (no shared state)

## Bug Tracking
**How do we manage issues?**

### Issue Tracking Process
1. **Report**: Create GitHub issue with reproduction steps
2. **Triage**: Label as bug, assign priority
3. **Fix**: Create branch, write failing test, fix bug
4. **Verify**: Ensure test passes, check coverage
5. **Regression**: Keep test to prevent future regressions

### Bug Severity Levels
- **Critical**: Feature completely broken (e.g., can't install any skill)
- **High**: Major functionality broken (e.g., symlinks fail on all platforms)
- **Medium**: Edge case broken (e.g., error on specific skill structure)
- **Low**: UX issue (e.g., unclear error message)

### Regression Testing Strategy
- All bug fixes must include test case
- Run full test suite before release
- Manual testing on all platforms (macOS, Linux, Windows)
- Test with real repositories (anthropics/skills, vercel-labs/agent-skills)
