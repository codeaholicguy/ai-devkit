---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding: Skill Update

## Problem Statement
**What problem are we solving?**

- **Core Problem**: Users currently have no way to update skills that have been installed from registries. Once a skill is installed via `ai-devkit skill add`, it remains static in the cache (`~/.ai-devkit/skills/`) even when the upstream repository receives updates, bug fixes, or new features.

- **Who is affected?**: 
  - Developers using ai-devkit who want to keep their skills up-to-date with the latest improvements
  - Skill authors who publish updates and want users to easily receive them
  - Teams collaborating on projects who need consistent skill versions

- **Current situation/workaround**: 
  - Users must manually navigate to `~/.ai-devkit/skills/<registry-id>` and run `git pull`
  - No visibility into which skills have updates available
  - No batch update capability
  - Error-prone manual process

## Goals & Objectives
**What do we want to achieve?**

### Primary Goals
- Provide a simple command to update all installed skills: `ai-devkit skill update`
- Allow updating skills from a specific registry: `ai-devkit skill update <registryId>`
- Show clear progress feedback for each skill being updated
- Handle errors gracefully and report them at the end without stopping the update process
- Validate that directories are git repositories before attempting updates

### Secondary Goals
- Provide helpful error messages when git pull fails (e.g., suggesting cleanup of unstaged commits)
- Skip non-git directories with informative logging
- Maintain compatibility with the existing skill installation system

### Non-Goals
- Automatic updates without user action
- Version pinning or rollback functionality (future feature)
- Updating individual skills by name (only all skills or by registry)
- Conflict resolution automation (users must resolve manually)

## User Stories & Use Cases
**How will users interact with the solution?**

### User Story 1: Update All Skills
**As a** developer using ai-devkit  
**I want to** update all my installed skills with a single command  
**So that** I can easily get the latest features and bug fixes without manual work

**Acceptance Criteria**:
- Running `ai-devkit skill update` updates all cached skill registries
- Progress is shown for each registry being updated
- Errors are collected and reported at the end
- Non-git directories are skipped with a log message

### User Story 2: Update Registry-Specific Skills
**As a** developer working with multiple skill registries  
**I want to** update only skills from a specific registry  
**So that** I can control which skill sources I update

**Acceptance Criteria**:
- Running `ai-devkit skill update anthropic/skills` updates only that registry
- The command validates that the registry exists in the cache
- Clear feedback is provided about what's being updated

### User Story 3: Handle Update Errors
**As a** developer with local modifications to skills  
**I want to** be informed about update failures without blocking other updates  
**So that** I can address issues selectively

**Acceptance Criteria**:
- Git pull errors don't stop the update process
- All errors are collected and displayed at the end
- Error messages suggest remediation (e.g., "clean up unstaged commits")
- Successfully updated skills are still reported

### User Story 4: Skip Non-Git Directories
**As a** developer with mixed skill sources  
**I want to** have non-git skill directories skipped gracefully  
**So that** I don't get errors for manually managed skills

**Acceptance Criteria**:
- Directories without `.git` are detected and skipped
- A log message indicates the skip reason
- The update process continues normally

## Success Criteria
**How will we know when we're done?**

### Functional Success
- ✅ `ai-devkit skill update` successfully updates all git-based skill registries
- ✅ `ai-devkit skill update <registryId>` updates a specific registry
- ✅ Non-git directories are skipped with appropriate logging
- ✅ Git pull errors are caught, logged, and don't stop the process
- ✅ Final summary shows: updated count, skipped count, error count

### User Experience Success
- ✅ Clear progress indication for each registry being processed
- ✅ Helpful error messages that guide users to resolution
- ✅ Command completes in reasonable time (< 5 seconds per registry)
- ✅ Output is clean, organized, and easy to understand

### Technical Success
- ✅ Integration with existing SkillManager class
- ✅ Reuse of existing git utilities where applicable
- ✅ No breaking changes to existing skill commands
- ✅ Unit tests cover all scenarios (success, errors, skips)

## Constraints & Assumptions
**What limitations do we need to work within?**

### Technical Constraints
- Must work with the existing skill cache structure (`~/.ai-devkit/skills/`)
- Must use the existing git utilities (`ensureGitInstalled`, etc.)
- Must integrate with the current SkillManager architecture
- Git must be installed on the user's system

### Business Constraints
- Should not introduce breaking changes to existing commands
- Must maintain backward compatibility with existing skill installations
- Should follow existing CLI patterns and conventions

### Assumptions
- Users have git installed (already required for `skill add`)
- Skill registries are git repositories (by design)
- Users understand basic git concepts (pull, conflicts, etc.)
- Network connectivity is available for git pull operations
- Registry structure follows the expected format: `~/.ai-devkit/skills/<owner>/<repo>/`

## Questions & Open Items
**What do we still need to clarify?**

### Resolved Questions
- ✅ Should we continue on errors? **Yes, collect and report at end**
- ✅ How to handle non-git directories? **Skip with log message**
- ✅ Update individual skills or registries? **Registries only**
- ✅ Show git output? **Show simplified progress, not raw git output**

### Open Questions
- Should we show which skills are available for update before pulling? (Future enhancement)
- Should we support a `--dry-run` flag? (Future enhancement)
- Should we track skill versions in config? (Future enhancement)
- Should we provide a rollback mechanism? (Future enhancement)

