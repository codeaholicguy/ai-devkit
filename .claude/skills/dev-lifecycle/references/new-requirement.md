# Phase 1: New Requirement

Guide the user through capturing a new feature requirement and setting up the full documentation structure.

## Step 1: Capture Requirement

Ask for:
- Feature name (kebab-case, e.g., `user-authentication`)
- Problem it solves
- Target users
- Key user stories

## Step 2: Create Documentation Structure

Copy each `README.md` template, preserving YAML frontmatter and section headings:

| Template | Target |
|----------|--------|
| `docs/ai/requirements/README.md` | `docs/ai/requirements/feature-{name}.md` |
| `docs/ai/design/README.md` | `docs/ai/design/feature-{name}.md` |
| `docs/ai/planning/README.md` | `docs/ai/planning/feature-{name}.md` |
| `docs/ai/implementation/README.md` | `docs/ai/implementation/feature-{name}.md` |
| `docs/ai/testing/README.md` | `docs/ai/testing/feature-{name}.md` |

## Step 3: Requirements Phase

Fill `docs/ai/requirements/feature-{name}.md`:
- Problem statement
- Goals and non-goals
- Detailed user stories
- Success criteria
- Constraints and assumptions
- Open questions

## Step 4: Design Phase

Fill `docs/ai/design/feature-{name}.md`:
- System architecture changes (include mermaid diagram)
- Data models / schema changes
- API endpoints or interfaces
- Components to create/modify
- Key design decisions
- Security and performance considerations

## Step 5: Planning Phase

Fill `docs/ai/planning/feature-{name}.md`:
- Task breakdown with subtasks
- Dependencies
- Effort estimates
- Implementation order
- Risks and mitigation

## Step 6: Documentation Review

After drafting, run:
1. **Review Requirements** (Phase 2) to validate completeness and clarity
2. **Review Design** (Phase 3) to ensure alignment and highlight key decisions

## Step 7: Implementation (Deferred)

This phase focuses on documentation only. Actual implementation happens via **Execute Plan** (Phase 4).

## Step 8: Testing Plan

In `docs/ai/testing/feature-{name}.md`:
- Unit test cases
- Integration test scenarios
- Manual testing steps
- Verify all success criteria are testable

## Step 9: PR Template

When ready, provide this MR/PR description:

```markdown
## Feature: [Feature Name]

### Summary
[Brief description]

### Requirements
- Documented in: `docs/ai/requirements/feature-{name}.md`

### Changes
- [Key changes]
- [New files/components]
- [Modified files]

### Design
- Architecture: [Link to design doc]
- Key decisions: [Summary]

### Testing
- Unit tests: [coverage/status]
- Integration tests: [status]
- Test documentation: `docs/ai/testing/feature-{name}.md`

### Checklist
- [ ] Code follows project standards
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No breaking changes (or documented)
- [ ] Ready for review
```
