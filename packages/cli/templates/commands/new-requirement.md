---
description: Add new feature/requirement documentation and guide me through the development workflow from requirements to testing.
---

I want to add a new feature/requirement. Please guide me through the complete development workflow:

## Step 1: Capture Requirement
First, ask me:
- What is the feature name? (e.g., "user-authentication", "payment-integration")
- What problem does it solve?
- Who will use it?
- What are the key user stories?

## Step 2: Create Feature Documentation Structure
Once I provide the requirement, create the following files (copy the existing template content so sections/frontmatter match exactly):
- Start from `docs/ai/requirements/README.md` → save as `docs/ai/requirements/feature-{name}.md`
- Start from `docs/ai/design/README.md` → save as `docs/ai/design/feature-{name}.md`
- Start from `docs/ai/planning/README.md` → save as `docs/ai/planning/feature-{name}.md`
- Start from `docs/ai/implementation/README.md` → save as `docs/ai/implementation/feature-{name}.md`
- Start from `docs/ai/testing/README.md` → save as `docs/ai/testing/feature-{name}.md`

Ensure the YAML frontmatter and section headings remain identical to the templates before filling in feature-specific content.

## Step 3: Requirements Phase
Help me fill out `docs/ai/requirements/feature-{name}.md`:
- Clarify the problem statement
- Define goals and non-goals
- Write detailed user stories
- Establish success criteria
- Identify constraints and assumptions
- List open questions

## Step 4: Design Phase
Guide me through `docs/ai/design/feature-{name}.md`:
- Propose system architecture changes needed
- Define data models/schema changes
- Design API endpoints or interfaces
- Identify components to create/modify
- Document key design decisions
- Note security and performance considerations

## Step 5: Planning Phase
Help me break down work in `docs/ai/planning/feature-{name}.md`:
- Create task breakdown with subtasks
- Identify dependencies (on other features, APIs, etc.)
- Estimate effort for each task
- Suggest implementation order
- Identify risks and mitigation strategies

## Step 6: Documentation Review (Chained Commands)
Once the docs above are drafted, run the following commands to tighten them up:
- `/review-requirements` to validate the requirements doc for completeness and clarity
- `/review-design` to ensure the design doc aligns with requirements and highlights key decisions

(If you are using Claude Code, reference the `review-requirements` and `review-design` commands instead.)

## Step 7: Implementation Phase (Deferred)
This command focuses on documentation only. Actual implementation happens later via `/execute-plan`.
For each task in the plan:
1. Review the task requirements and design
2. Ask me to confirm I'm starting this task
3. Guide implementation with reference to design docs
4. Suggest code structure and patterns
5. Help with error handling and edge cases
6. Update `docs/ai/implementation/feature-{name}.md` with notes

## Step 8: Testing Phase
Guide testing in `docs/ai/testing/feature-{name}.md`:
- Draft unit test cases with `/writing-test`
- Draft integration test scenarios with `/writing-test`
- Recommend manual testing steps
- Help write test code
- Verify all success criteria are testable

## Step 9: Local Testing & Verification
Guide me through:
1. Running all tests locally
2. Manual testing checklist
3. Reviewing against requirements
4. Checking design compliance
5. Preparing for code review (diff summary, list of files, design references)

## Step 10: Local Code Review (Optional but recommended)
Before pushing, ask me to run `/code-review` with the modified file list and relevant docs.

## Step 11: Implementation Execution Reminder
When ready to implement, run `/execute-plan` to work through the planning doc tasks interactively. That command will orchestrate implementation, testing, and follow-up documentation.

## Step 12: Create Merge/Pull Request
Provide the MR/PR description:
```markdown
## Feature: [Feature Name]

### Summary
[Brief description of what this feature does]

### Requirements
- Documented in: `docs/ai/requirements/feature-{name}.md`
- Related to: [issue/ticket number if applicable]

### Changes
- [List key changes]
- [List new files/components]
- [List modified files]

### Design
- Architecture: [Link to design doc section]
- Key decisions: [Brief summary]

### Testing
- Unit tests: [coverage/status]
- Integration tests: [status]
- Manual testing: Completed
- Test documentation: `docs/ai/testing/feature-{name}.md`

### Checklist
- [ ] Code follows project standards
- [ ] All tests pass
- [ ] Documentation updated
- [ ] No breaking changes (or documented if any)
- [ ] Ready for review
```

Then provide the appropriate command:
- **GitHub**: `gh pr create --title "feat: [feature-name]" --body-file pr-description.md`
- **GitLab**: `glab mr create --title "feat: [feature-name]" --description "$(cat mr-description.md)"`

---

**Let's start! Tell me about the feature you want to build.**

