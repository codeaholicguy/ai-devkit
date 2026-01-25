---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown: Skill Management

## Milestones (MVP - Simplified)

- [ ] **Milestone 1**: Create simple registry.json file
- [ ] **Milestone 2**: Implement SkillManager class (add, list, remove)
- [ ] **Milestone 3**: Wire up CLI commands
- [ ] **Milestone 4**: Test and document

## Task Breakdown (MVP - Simplified)

### Phase 1: Setup Registry (15 min)
- [ ] **Task 1.1**: Create `skills/registry.json` in repo root
  ```json
  {
    "registries": {
      "anthropics/skills": "https://github.com/anthropics/skills.git",
      "vercel-labs/agent-skills": "https://github.com/vercel-labs/agent-skills.git"
    }
  }
  ```
  - Commit and push to main branch
  - **Estimated effort**: 15 minutes

### Phase 2: Implement SkillManager (3-4 hours)
- [ ] **Task 2.1**: Create `src/lib/SkillManager.ts`
  - Fetch registry JSON from GitHub raw URL
  - `addSkill(registryId, skillName)`:
    - Check `~/.ai-devkit/skills/{registryId}` exists
    - If not, run `git clone` via child_process
    - Read `.ai-devkit.json` for environments
    - Try `fs.symlink()` to `.cursor/skills/` and `.claude/skills/`
    - If symlink fails, use `fs.cp()` recursive
  - `listSkills()`:
    - Read `.cursor/skills/` and `.claude/skills/` directories
    - Return list of directory names
  - `removeSkill(skillName)`:
    - Delete from `.cursor/skills/` and `.claude/skills/`
  - **Estimated effort**: 3-4 hours

### Phase 3: Wire Up CLI Commands (30 min)
- [ ] **Task 3.1**: Add commands to `src/commands/skill.ts`
  - Register `skill add <registry-repo> <skill-name>`
  - Register `skill list`
  - Register `skill remove <skill-name>`
  - Each command creates SkillManager and calls method
  - **Estimated effort**: 30 minutes

### Phase 4: Test & Document (1-2 hours)
- [ ] **Task 4.1**: Manual testing
  - Test on macOS/Linux
  - Test on Windows (if available)
  - Test symlink fallback to copy
  - **Estimated effort**: 1 hour

- [ ] **Task 4.2**: Write basic unit tests
  - Mock git/fs operations
  - Test happy path for add/list/remove
  - **Estimated effort**: 1 hour

- [ ] **Task 4.3**: Update CLI README
  - Document 3 commands with examples
  - **Estimated effort**: 15 minutes

## Dependencies (MVP)

### Task Order
1. Create registry.json first (Phase 1)
2. Build SkillManager (Phase 2)
3. Wire up CLI (Phase 3)
4. Test (Phase 4)

### External Dependencies
- **Git**: Must be installed on user's system
- **GitHub**: Public access to clone repos
- **File system**: Read/write to home directory and project directory

### No New NPM Dependencies Needed
- Use Node.js built-ins: `child_process`, `fs`, `path`, `https`
- Commander.js already in project

## Timeline & Estimates
**When will things be done?**

### Estimated Effort Per Phase (MVP)
- **Phase 1 (Registry)**: 15 minutes
- **Phase 2 (SkillManager)**: 3-4 hours  
- **Phase 3 (CLI)**: 30 minutes
- **Phase 4 (Test & Docs)**: 2 hours

### Total Estimated Effort
- **Total MVP**: ~6 hours (less than 1 day)
- **Buffer**: Add 2 hours for unknowns
- **Total with buffer**: ~8 hours

**Note**: This is a working MVP. Add features incrementally after this works.

## Risks & Mitigation (MVP)

**Risk 1: Symlinks Fail on Windows**
- **Impact**: Medium
- **Mitigation**: Auto-fallback to copy. Works either way.

**Risk 2: Git Not Installed**
- **Impact**: High
- **Mitigation**: Check git exists, show install instructions if missing

**Risk 3: Network Issues**
- **Impact**: Medium
- **Mitigation**: Show clear error: "Failed to clone. Check network."

**Risk 4: Implementation Takes Longer**
- **Impact**: Low
- **Mitigation**: MVP is small (6 hours). Even double (12h) is fine.

## Resources Needed (MVP)

### Developer
- 1 person, 6-8 hours

### Tools
- Node.js + TypeScript (already have)
- Git command-line (already installed)
- Commander.js (already in project)

### Infrastructure
- GitHub repo to host `skills/registry.json`

**That's it. No new tools or dependencies.**
