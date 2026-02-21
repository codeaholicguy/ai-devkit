---
title: Development with AI DevKit
description: Learn how to use AI DevKit commands for structured development workflows
slug: development-with-ai-devkit
order: 3
---

AI DevKit provides a structured workflow that takes you from idea to deployed feature. Instead of jumping straight into code, you'll create documentation at each phase—this gives your AI assistant the context it needs to help you effectively.

## Why Structured Development?

When you work with AI assistants without structure, you often:
- Lose context between sessions
- Repeat yourself explaining requirements
- End up with inconsistent code and documentation

AI DevKit solves this by creating documentation as you go. Each document becomes context for the next phase, so your AI assistant always knows what you're building and why.

## The Development Lifecycle

### 1. Start with `/new-requirement`

The `/new-requirement` command is your entry point for any new feature. It guides you through the complete lifecycle:

```
/new-requirement
```

**What happens:**

| Phase | What You Do |
|-------|-------------|
| **Requirements** | Define what you're building and why |
| **Design** | Create architecture and technical specs |
| **Planning** | Break work into actionable tasks |
| **Implementation** | Code with step-by-step guidance |
| **Testing** | Generate comprehensive test coverage |

**Documentation created:**

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

Instead of manually typing each command, you can use the `dev-lifecycle` skill to guide you through the entire workflow automatically. The skill triggers the next phase for you whenever the current phase is complete — no need to remember which command comes next.

### Installing the skill

Install the `dev-lifecycle` skill from the AI DevKit registry:

```bash
ai-devkit skill add codeaholicguy/ai-devkit dev-lifecycle
```

or

```bash
npx ai-devkit@latest skill add codeaholicguy/ai-devkit dev-lifecycle
```

Once installed, the skill is immediately available to your AI agent. For more details on managing skills, see [Skills](/docs/skills).

### How to use it

Tell your AI assistant to use the skill and describe what you want to build. For example:

> "Use dev-lifecycle skill to build a feature to update the agent memory"

The skill takes over from there:

1. It walks you through **requirements gathering** — asking clarifying questions about your feature
2. Once requirements are clear, it automatically moves to **requirements review**
3. Then proceeds to **design review**, **planning**, **implementation**, **testing**, and **code review**

You don't need to type `/review-requirements`, `/review-design`, or any other command manually — the skill handles phase transitions for you.

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

> **When to use the skill vs. individual commands:**
> - Use the `dev-lifecycle` skill when starting a new feature or continuing end-to-end work — it handles the flow for you
> - Use individual commands (like `/code-review` or `/writing-test`) when you only need one specific phase

## Refinement Commands

If you're using the `dev-lifecycle` skill, these commands run automatically as part of the workflow. You can also run them individually when you need a specific phase:

### `/review-requirements`

```
/review-requirements
```

**When to use:** Before starting design, to catch gaps in your requirements.

**What it does:**
- Validates completeness of requirements
- Identifies missing acceptance criteria
- Suggests clarifying questions

### `/review-design`

```
/review-design
```

**When to use:** After design, before implementation, to ensure your architecture is solid.

**What it does:**
- Ensures architecture clarity
- Generates Mermaid diagrams for visualization
- Checks alignment with requirements

### `/execute-plan`

```
/execute-plan
```

**When to use:** During implementation, to work through tasks systematically.

**What it does:**
- Reads your planning document
- Presents tasks in logical order
- Tracks progress and captures notes
- Prompts documentation updates as you go

### `/update-planning`

```
/update-planning
```

**When to use:** When implementation drifts from the original plan.

**What it does:**
- Syncs planning documentation with actual progress
- Updates task status and notes
- Keeps documentation current

## Quality Commands

### `/code-review`

```
/code-review
```

**When to use:** Before committing, to catch issues early.

**What it checks:**
- Alignment with design documents
- Logic, security, and performance issues
- Code redundancy and duplication
- Missing tests and documentation

### `/writing-test`

```
/writing-test
```

**When to use:** After implementation, to ensure coverage.

**What it does:**
- Generates unit and integration tests
- Targets high coverage of your new code
- Follows your project's testing conventions

## Tips for Success

1. **Don't skip phases** — Each phase builds context for the next. The `dev-lifecycle` skill handles this automatically
2. **Keep docs updated** — Use `/update-planning` when things change
3. **Review before committing** — `/code-review` catches issues early
4. **Be specific** — The more detail you give, the better your AI assistant can help

## Next Steps

- **Debug effectively** — See [Debugging with AI DevKit](/docs/4-debugging-with-ai-devkit)
- **Understand existing code** — See [Understanding Existing Code](/docs/5-understand-existing-code-with-ai-devkit)
- **Give your AI memory** — See [Memory](/docs/6-memory)
