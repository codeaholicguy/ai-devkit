---
title: Development with AI DevKit
description: Learn how to use AI DevKit commands for structured development workflows
slug: development-with-ai-devkit
order: 3
---

## Start with `/new-requirement`

The `/new-requirement` command is your entry point for any new feature development. It guides you through a complete development lifecycle:

```bash
# In Cursor or Claude Code
/new-requirement
```

**What happens:**
1. **Requirements Capture** - Define what you're building and why
2. **Design Phase** - Create architecture and technical specifications  
3. **Planning** - Break down work into actionable tasks
4. **Implementation** - Step-by-step coding with guidance
5. **Testing** - Generate comprehensive test coverage
6. **Git Workflow** - Structured commits and PR creation

**Generated Documentation:**
- `docs/ai/requirements/feature-{name}.md` - Requirements and user stories
- `docs/ai/design/feature-{name}.md` - Architecture and technical design
- `docs/ai/planning/feature-{name}.md` - Task breakdown and timeline
- `docs/ai/implementation/feature-{name}.md` - Implementation notes
- `docs/ai/testing/feature-{name}.md` - Test strategy and cases

### Refine Your Work

**Review Requirements:**
```bash
/review-requirements
```
Validates completeness and identifies gaps in your requirements.

**Review Design:**
```bash
/review-design
```
Ensures architecture clarity and generates Mermaid diagrams.

**Execute Your Plan:**
```bash
/execute-plan
```
Interactive task execution that:
- Reads your planning document
- Presents tasks in logical order
- Captures progress and notes
- Prompts documentation updates

**Code Review:**
```bash
/code-review
```
Pre-commit review that checks:
- Alignment with design documents
- Logic, security, and performance issues
- Code redundancy and missing tests
- Documentation completeness

**Generate Tests:**
```bash
/writing-test
```
Creates unit and integration tests targeting high coverage.