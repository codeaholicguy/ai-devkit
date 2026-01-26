---
title: Understanding Existing Code with AI DevKit
description: Learn how to analyze and document existing codebases using AI DevKit's capture-knowledge command
order: 4
---

## What is Knowledge Capture?

When joining a new project or working with unfamiliar code, understanding how everything fits together can be overwhelming. The `/capture-knowledge` command analyzes your codebase from any entry point and generates comprehensive documentation with visual diagrams—helping you understand complex systems in minutes instead of hours.

**Common scenarios:**
- You just joined a team and need to understand the authentication system
- You're debugging an issue and need to trace the complete execution flow
- You're planning a refactor and need to see all dependencies

## Prerequisites

Before using `/capture-knowledge`, ensure you have:
- Initialized AI DevKit in your project (`ai-devkit init`)
- An AI editor with slash command support (Cursor, Claude Code, etc.)

## Using the Command

> **Note:** The `/capture-knowledge` command is a **slash command** — type it directly in your AI editor's chat window, not in the terminal.

### In Cursor or Similar Editors

```
/capture-knowledge <entry-point>
```

### In Claude Code

```
Use the capture-knowledge command to analyze <entry-point>
```

## Entry Point Types

You can analyze code starting from different types of entry points:

### Files

```
/capture-knowledge src/api/users.ts
```

Analyzes a specific file and its dependencies.

### Folders

```
/capture-knowledge src/services/
```

Analyzes an entire module or directory structure.

### Functions

```
/capture-knowledge calculateTotalPrice
```

Analyzes a specific function and its call chain.

### API Endpoints

```
/capture-knowledge POST:/api/users
```

Analyzes complete API request/response flow.

## What You Get

### Detailed Explanations
- Natural language descriptions of how code works
- Implementation details and design patterns
- Logic flow and component relationships

### Recursive Analysis
- Automatically traces all dependencies
- Maps complete execution paths
- Identifies external integrations

### Visual Diagrams
- Flowcharts showing execution paths
- Sequence diagrams for API flows
- Architecture diagrams for modules
- Component relationship maps

### Actionable Insights
- Performance considerations
- Security implications
- Potential improvements
- Refactoring opportunities

## Example Output

When you run `/capture-knowledge src/services/auth/`, the AI generates documentation like this:

**docs/ai/knowledge/auth-service.md:**

```markdown
# Auth Service Analysis

## Overview
The auth service handles user authentication using JWT tokens...

## Architecture Diagram

flowchart TD
    A[Login Request] --> B[Validate Credentials]
    B --> C{Valid?}
    C -->|Yes| D[Generate JWT]
    C -->|No| E[Return 401]

## Key Components
- `AuthController` — Handles HTTP endpoints
- `TokenService` — Manages JWT creation and validation
- `UserRepository` — Database access for user data
```

## Where Results Are Saved

Generated documentation is saved to `docs/ai/knowledge/` in your project:

```
docs/ai/knowledge/
├── auth-service.md       # Analysis of auth module
├── user-api.md           # Analysis of user endpoints
└── diagrams/             # Generated visual diagrams
```

These files can be committed to version control, making your knowledge base searchable and shareable with your team.

## Use Cases

| Use Case | Description |
|----------|-------------|
| **Onboarding** | Help new developers understand complex systems quickly |
| **Documentation** | Generate comprehensive system documentation automatically |
| **Debugging** | Understand complete execution flows before diving into code |
| **Refactoring** | Get full context and dependency maps before making changes |
| **Knowledge Base** | Create searchable, versioned documentation for your team |

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Command not recognized | Run `ai-devkit init` first to install commands |
| Analysis seems incomplete | Try analyzing a smaller entry point first |
| Diagrams not rendering | Ensure your editor supports Mermaid syntax |
| Entry point not found | Check the path is relative to your project root |

## Next Steps

- **Debug an issue** — Use [`/debug`](/docs/debugging-with-ai-devkit) with your captured knowledge for context
- **Plan a refactor** — Use your analysis to inform design decisions with `/review-design`
- **Build your knowledge base** — Enable [Memory](/docs/memory) to make your captured knowledge searchable
- **Extend capabilities** — Install [Skills](/docs/skills) to add more AI capabilities