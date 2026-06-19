---
title: Development with AI DevKit
description: Run an agentic software development workflow where AI coding agents plan, implement, test, verify, and review before push.
slug: development-with-ai-devkit
order: 3
---

AI DevKit includes a repeatable engineering workflow inside the larger control plane. Instead of letting an agent jump straight into code, you create durable context at each phase so it can plan, implement, verify, and review with a clear source of truth.

This is the reliability layer of AI DevKit: humans keep ownership of requirements and quality, while AI coding agents follow the same SDLC checkpoints when the work needs more rigor.

## Why a Repeatable Workflow?

When you work with AI coding agents without structure, you often:
- Lose context between sessions
- Repeat yourself explaining requirements
- End up with inconsistent code and documentation

AI DevKit solves this by creating workflow docs as you go. Each document becomes context for the next phase, so your coding agent knows what you're building, why it matters, and what evidence is required before claiming completion.

## The Development Lifecycle

### 1. Start with the Dev Lifecycle Skill

The `dev-lifecycle` skill is your entry point for any new feature. Ask your agent to use it and describe what you want to build:

```
Use the dev-lifecycle skill to build <feature>
```

**What happens:**

| Phase | What You Do |
|-------|-------------|
| **Workspace** | Set up or resume the feature worktree |
| **Requirements** | Define what you're building and why |
| **Design** | Create architecture and technical specs |
| **Planning** | Break work into actionable tasks |
| **Implementation** | Code with step-by-step guidance |
| **Testing** | Generate comprehensive test coverage |
| **Review** | Check drift, missing tests, and edge cases before push |

**Documentation created:**

AI DevKit creates these under your configured docs directory. The default is `docs/ai/`.

```
docs/ai/
├── requirements/feature-{name}.md   # What and why
├── design/feature-{name}.md         # Architecture
├── planning/feature-{name}.md       # Task breakdown
├── implementation/feature-{name}.md # Implementation notes
└── testing/feature-{name}.md        # Test strategy
```

> **Tip:** You don't have to complete all phases in one session. AI DevKit saves your documentation, so you can pick up where you left off.

## Using the Dev Lifecycle Skill

Use the `dev-lifecycle` skill to guide you through the entire workflow. The skill validates that the phase skills are installed, proposes the next phase plan, and routes execution to the focused skill for that phase.

If you want the full setup, dependencies, and usage guide, see [Dev Lifecycle Skill](/docs/10-dev-lifecycle-skill).

### Installing the skill

Install the built-in AI DevKit skills:

```bash
ai-devkit skill add --built-in
```

or

```bash
npx ai-devkit@latest skill add --built-in
```

Once installed, the skill is immediately available to your AI agent. For more details on managing skills, see [Skills](/docs/7-skills).

### How to use it

Tell your coding agent to use the skill and describe what you want to build. For example:

> "Use dev-lifecycle skill to build an authentication feature with Google OAuth and email login"

The orchestrator takes over from there:

1. It walks you through **requirements gathering** — asking clarifying questions about your feature
2. It proposes a phase plan before making changes
3. Once requirements are clear, it routes to **requirements review**
4. Then proceeds through **design review**, **planning**, **implementation**, **testing**, and **code review**

You do not need separate workflow prompt files — the skill handles phase transitions for you.

### Automatic phase progression

The key difference from running individual commands: the skill **suggests and triggers the next phase** after each one completes. If a review phase finds issues, it loops back to the right phase automatically.

| Scenario | What Happens |
|----------|--------------|
| Requirements review finds gaps | Loops back to requirements to fill them |
| Design review finds requirement issues | Loops back to requirements review |
| Implementation doesn't match design | Loops back to design or implementation |
| Tests reveal design flaws | Loops back to design review |

### Resuming work

If you started a feature in a previous session, the skill can pick up where you left off. It checks your existing documentation to determine which phase you're in and continues from there.

> **When to use lifecycle vs. focused skills:**
> - Use the `dev-lifecycle` skill when starting a new feature or continuing end-to-end work — it handles the flow for you
> - Use focused phase skills such as `dev-worktree`, `dev-requirements`, `dev-design`, or `dev-review` when you only need one lifecycle phase
> - Use focused support skills such as `tdd`, `verify`, or `structured-debug` when you only need one specific behavior

## Focused Workflow Requests

If you're using the `dev-lifecycle` skill, these phases are covered as part of the workflow. You can also ask for a specific phase directly:

### Requirements Review

```
Review the requirements for feature-authentication
```

**When to use:** Before starting design, to catch gaps in your requirements.

**What it does:**
- Validates completeness of requirements
- Identifies missing acceptance criteria
- Suggests clarifying questions

### Design Review

```
Review the design for feature-authentication
```

**When to use:** After design, before implementation, to ensure your architecture is solid.

**What it does:**
- Ensures architecture clarity
- Generates Mermaid diagrams for visualization
- Checks alignment with requirements

### Execute Plan

```
Execute the implementation plan for feature-authentication
```

**When to use:** During implementation, to work through tasks systematically.

**What it does:**
- Reads your planning document
- Presents tasks in logical order
- Tracks progress and captures notes
- Prompts documentation updates as you go

### Update Planning

```
Update the planning docs with current implementation progress
```

**When to use:** When implementation drifts from the original plan.

**What it does:**
- Syncs planning documentation with actual progress
- Updates task status and notes
- Keeps documentation current

## Quality Requests

### Code Review

```
Review the current diff before I commit
```

**When to use:** Before committing, to catch issues early.

**What it checks:**
- Alignment with design documents
- Logic, security, and performance issues
- Code redundancy and duplication
- Missing tests and documentation

### Testing

```
Use TDD to add tests for this change
```

**When to use:** After implementation, to ensure coverage.

**What it does:**
- Generates unit and integration tests
- Targets high coverage of your new code
- Follows your project's testing conventions

## Tips for Success

1. **Don't skip phases** — Each phase builds context for the next. The `dev-lifecycle` skill handles this automatically
2. **Keep docs updated** — Ask the agent to update planning when things change
3. **Review before committing** — Ask for code review before you push
4. **Be specific** — The more detail you give, the better your coding agent can help

## Next Steps

- **Debug effectively** — See [Debugging with AI DevKit](/docs/4-debugging-with-ai-devkit)
- **Understand existing code** — See [Understanding Existing Code](/docs/5-understand-existing-code-with-ai-devkit)
- **Give your AI memory** — See [Memory](/docs/6-memory)
