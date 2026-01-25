---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding: Skill Management

## Problem Statement
**What problem are we solving?**

- **Current Pain Point**: Users need to manually copy skill files from various GitHub repositories (e.g., anthropics/skills, vercel-labs/agent-skills) to their local projects every time they start a new project or want to add a skill
- **Who is affected**: All ai-devkit users who want to leverage Agent Skills in their projects across multiple AI assistants (Cursor, Claude Code, etc.)
- **Current workaround**: 
  - Manually browse GitHub repositories to find skills
  - Copy entire skill directories from GitHub to local project (e.g., `.claude/skills/frontend-design`)
  - Repeat this process for every new project
  - Results in duplicate files across projects, wasting disk space
  - No centralized way to discover or manage skills

## Goals & Objectives
**What do we want to achieve?**

### Primary Goals (MVP)
1. **Centralized Skill Registry**: Simple registry file on GitHub listing skill repositories
2. **Local Skill Cache**: Create `~/.ai-devkit/skills/` to avoid duplication across projects
3. **Easy Installation**: One command to install a skill from a registry
4. **Basic Management**: List and remove installed skills

### Future Goals (Post-MVP)
1. Skill updates (git pull)
2. Search and discovery features
3. Skill info preview
4. Copy vs symlink choice (MVP: symlink with copy fallback)
5. Custom/unverified registries

### Non-Goals (out of scope)
1. Creating or authoring new skills (this is a management tool, not a skill development tool)
2. Validating skill quality or functionality (delegated to community review)
3. Hosting skills directly (we use existing GitHub repos)
4. Managing skill versions beyond git references

## User Stories & Use Cases
**How will users interact with the solution?**

### MVP User Stories

### User Story 1: Installing a Skill (Core)
**As a** developer using ai-devkit  
**I want to** install a skill with one command  
**So that** I can quickly add AI assistant capabilities without manual copying

**Acceptance Criteria**:
- Run `ai-devkit skill add anthropics/skills frontend-design`
- If repo not cached, clones to `~/.ai-devkit/skills/anthropics/skills/`
- If repo cached, uses existing clone
- Reads `.ai-devkit.json` to determine environments (cursor, claude)
- If no config, prompts once and creates it
- Symlinks skill to `.cursor/skills/` and/or `.claude/skills/`
- Falls back to copy if symlinks fail (e.g., Windows)

### User Story 2: Listing Installed Skills
**As a** developer  
**I want to** see which skills are in my project  
**So that** I know what's available

**Acceptance Criteria**:
- Run `ai-devkit skill list`
- Shows skill names and source registries
- Simple table or list output

### User Story 3: Removing a Skill
**As a** developer  
**I want to** remove a skill I no longer need  
**So that** I can clean up my project

**Acceptance Criteria**:
- Run `ai-devkit skill remove frontend-design`
- Removes from `.cursor/skills/` and `.claude/skills/`
- Does NOT remove from cache (other projects might use it)
- Simple confirmation message

### Future User Stories (Post-MVP)
- Search for skills by keyword
- Preview skill info before installing
- Update skills to latest version
- Install from unverified/custom registries with warnings
- Choose copy vs symlink per skill

### Edge Cases to Consider (MVP)
1. **Network Failures**: Show error, suggest checking connection
2. **Symlink Support**: Auto-fallback to copy on Windows if symlink fails
3. **No Config File**: Prompt user once, create `.ai-devkit.json`
4. **Skill Already Exists**: Skip with message "already installed"

### Edge Cases (Post-MVP)
- Corrupted cache handling
- Skill name conflicts between registries
- Partial installation recovery
- Permission errors

## Success Criteria
**How will we know when we're done?**

### Measurable Outcomes
1. Users can install a skill with a single command
2. Skills are cached locally to avoid re-downloading
3. Installation works across all supported environments (cursor, claude)
4. Users can install both trusted and untrusted skills with appropriate warnings
5. Zero duplicate skill files across multiple projects (when using symlinks)

### Acceptance Criteria (MVP)
- [ ] `ai-devkit skill add <registry>/<repo> <skill-name>` installs a skill
- [ ] Skills cached in `~/.ai-devkit/skills/` (cloned once, reused)
- [ ] Reads `.ai-devkit.json` for target environments
- [ ] Creates `.ai-devkit.json` if missing (prompts user)
- [ ] Symlinks skill to project (copy fallback on error)
- [ ] `ai-devkit skill list` shows installed skill names and sources
- [ ] `ai-devkit skill remove <skill-name>` removes skill from project
- [ ] Works on macOS, Linux, and Windows

### Performance Benchmarks (MVP)
- Skill installation (cached): < 2 seconds
- Skill installation (first time): < 15 seconds (git clone)

## Constraints & Assumptions
**What limitations do we need to work within?**

### Technical Constraints
1. **Git Dependency**: Requires git to be installed on user's system
2. **Filesystem Access**: Requires read/write access to home directory and project directory
3. **Network Access**: Requires internet connection for initial skill downloads
4. **Symlink Support**: Symlinks may not work on all Windows configurations

### Business Constraints
1. **GitHub Dependency**: Registry and skills are hosted on GitHub
2. **Community Trust Model**: Relying on community to verify skill registries
3. **No Skill Hosting**: We don't host skills ourselves, only manage references

### Assumptions
1. Skills follow the Agent Skills specification (SKILL.md format)
2. Skill repositories are publicly accessible GitHub repos
3. Users have basic understanding of command-line tools
4. Registry file format is JSON and maintained by ai-devkit maintainers
5. Skill names are unique within a registry

## Questions & Open Items
**What do we still need to clarify?**

### MVP Decisions (Keep It Simple)
1. ✅ **Registry Format**: Simple map of ID → URL. No metadata yet.
2. ✅ **Install Method**: Symlink with auto-fallback to copy. No user choice.
3. ✅ **Config**: Use existing `.ai-devkit.json`. No new config files.
4. ✅ **Tracking**: No manifest. List skills by reading directories.
5. ✅ **Commands**: Only `add`, `list`, `remove` for MVP.

### Deferred to Post-MVP
1. Search and info commands
2. Update command
3. Unverified/custom registries
4. User preferences and defaults
5. Version tracking and pinning
6. Dependency management

### No Stakeholder Decisions Needed for MVP
- Just build it simple and iterate based on feedback

### Research Needed
1. Research Agent Skills validation tools (skills-ref library mentioned in spec)
2. Investigate Windows symlink alternatives (junction points as middle-ground option)
3. Study existing package managers for UX patterns (npm, brew, apt)
4. Analyze common skill repository structures in anthropics/skills and vercel-labs/agent-skills for robust parsing
