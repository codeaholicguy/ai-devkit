---
title: Skills
description: Extend your AI agents with reusable, community-driven skills from skill registries.
slug: skills
order: 8
---

**Skills** are packaged capabilities that extend what your AI agents can do. Think of them as "plugins" for your AI assistant—each skill teaches your agent a new competency, like frontend design patterns, database optimization, or security best practices.

> **Note:** AI DevKit reads your project configuration from `.ai-devkit.json`. If this file doesn't exist when you run `skill add`, you'll be prompted to select which AI environments to configure. Skills require at least one skill-capable environment (Cursor, Claude Code, Codex, OpenCode, or Antigravity).

## How Skills Work

A skill is a folder containing a `SKILL.md` file and optional supporting resources (scripts, examples, templates). When you install a skill, it's **symlinked** into your project's skill directory, making it immediately available to your AI agent.

> **What's a symlink?** A symlink (symbolic link) is like a shortcut—instead of copying files, it creates a reference to the original location. This means updates to the cached skill are automatically reflected in your project. On systems where symlinks aren't supported, files are copied instead.

Skills are distributed via **Skill Registries**—GitHub repositories that follow a standard structure. The AI DevKit maintains a curated list of registries, so you can easily discover and install skills from the community.

## Quick Start

Get up and running in 30 seconds:

```bash
# 1. Initialize ai-devkit in your project (if not already done)
ai-devkit init

# 2. Install a skill from a registry
ai-devkit skill add anthropics/skills frontend-design

# 3. Done! Your AI agent can now use the skill.
```

Once installed, simply ask your AI agent to use the skill's capabilities—it will automatically apply the techniques and patterns defined in the skill.

## Supported Environments

Skills are currently supported by the following AI coding agents:


| Environment     | Skill Path         |
| --------------- | ------------------ |
| **Cursor**      | `.cursor/skills`   |
| **Claude Code** | `.claude/skills`   |
| **Codex**       | `.codex/skills`    |
| **OpenCode**    | `.opencode/skills` |
| **Antigravity** | `.agent/skills`    |


When you install a skill, it's automatically added to all skill-capable environments configured in your project.

## Using Installed Skills

Once a skill is installed, your AI agent automatically has access to it. You don't need to do anything special—just ask!

### How It Works

When your AI agent starts a session, it reads the `SKILL.md` files from your project's skill directories. These files contain instructions that teach the agent new capabilities, patterns, or best practices.

### Example Usage

Let's say you installed a `frontend-design` skill. You can now ask your agent:

> "Use the frontend-design skill to create a responsive navigation component"

Or simply reference the concepts the skill teaches:

> "Build a card component following modern design patterns"

The agent will apply the techniques, conventions, and examples defined in the skill's instructions.

### Tips for Using Skills

- **Be explicit**: Mention the skill by name if you want the agent to use specific techniques from it
- **Check skill contents**: Read the `SKILL.md` file to understand what capabilities it provides
- **Combine skills**: Multiple skills can work together—install several to expand your agent's knowledge

## Commands

### `ai-devkit skill add`

Install a skill from a registry.

**Syntax:**

```bash
ai-devkit skill add <registry-repo> <skill-name>
```

**Parameters:**

- `<registry-repo>`: The registry identifier (e.g., `anthropics/skills`)
- `<skill-name>`: The name of the skill to install (e.g., `frontend-design`)

**Example:**

```bash
ai-devkit skill add anthropics/skills frontend-design
```

This command will:

1. Fetch the skill registry from GitHub
2. Clone the registry repository to a local cache (`~/.ai-devkit/skills/`)
3. Verify the skill exists and contains a valid `SKILL.md`
4. Symlink the skill into your project's skill directories

**Output:**

```
Validating skill: frontend-design from anthropics/skills
Fetching registry from GitHub...
Checking local cache...
  → Cloning anthropics/skills (this may take a moment)...
Loading project configuration...
Installing skill to project...
  → .cursor/skills/frontend-design (symlinked)
  → .claude/skills/frontend-design (symlinked)

Successfully installed: frontend-design
  Source: anthropics/skills
  Installed to: cursor, claude
```

### `ai-devkit skill list`

List all skills installed in your project.

**Syntax:**

```bash
ai-devkit skill list
```

**Example Output:**

```
Installed Skills:

  Skill Name       Registry              Environments
  ────────────────────────────────────────────────────
  frontend-design  anthropics/skills     cursor, claude
  api-patterns     vercel-labs/agent-skills  cursor, claude

  Total: 2 skill(s)
```

The list shows:

- **Skill Name**: The installed skill's name
- **Registry**: The source registry where the skill came from
- **Environments**: Which AI environments have this skill installed

### `ai-devkit skill remove`

Remove a skill from your project.

**Syntax:**

```bash
ai-devkit skill remove <skill-name>
```

**Example:**

```bash
ai-devkit skill remove frontend-design
```

**Output:**

```
Removing skill: frontend-design
  → Removed from .cursor/skills
  → Removed from .claude/skills

Successfully removed from 2 location(s).
Note: Cached copy in ~/.ai-devkit/skills/ preserved for other projects.
```

The cached copy remains in `~/.ai-devkit/skills/` so you can quickly reinstall it in other projects without re-downloading.

## Skill Registry

AI DevKit uses a centralized registry file to map registry identifiers to their GitHub repositories. The registry is hosted at:

```
https://raw.githubusercontent.com/Codeaholicguy/ai-devkit/main/skills/registry.json
```

### Custom Registries

You can add your own registries by editing the global AI DevKit config at `~/.ai-devkit/.ai-devkit.json`. Custom registries use the same `registries` map format and are merged with the default registry list. If a registry ID exists in both, your custom entry takes priority.

**Example:**

```json
{
  "skills": {
    "registries": {
      "my-org/skills": "git@gitlab.com:my-org/skills.git",
      "me/personal-skills": "https://github.com/me/personal-skills.git"
    }
  }
}
```

Once saved, you can install from your custom registry like any other:

```bash
ai-devkit skill add my-org/skills internal-skill
```

### Registry Format

The registry is a simple JSON file:

```json
{
  "registries": {
    "anthropics/skills": "https://github.com/anthropics/skills.git",
    "vercel-labs/agent-skills": "https://github.com/vercel-labs/agent-skills.git"
  }
}
```

Each registry repository should follow this structure:

```
skills/
├── skill-name-1/
│   ├── SKILL.md           # Required: Main skill instructions
│   ├── scripts/           # Optional: Helper scripts
│   ├── examples/          # Optional: Usage examples
│   └── resources/         # Optional: Additional assets
├── skill-name-2/
│   └── SKILL.md
└── ...
```

## Creating Your Own Skills

Want to create your own skills? Here's what you need:

### SKILL.md Structure

Every skill must have a `SKILL.md` file with YAML frontmatter:

```markdown
---
name: my-awesome-skill
description: A brief description of what this skill does
---

# My Awesome Skill

Detailed instructions for the AI agent on how to use this skill...
```

### Publishing Skills

1. Create a GitHub repository with the `skills/` directory structure
2. Add your skills with proper `SKILL.md` files
3. Open a PR to add your registry to the [ai-devkit registry](https://github.com/Codeaholicguy/ai-devkit/blob/main/skills/registry.json)

## Caching & Performance

To provide fast installation times, AI DevKit caches skill registries locally:

- **Cache Location**: `~/.ai-devkit/skills/<registry-id>/`
- **Behavior**: Repositories are cloned once and reused across projects

## Troubleshooting

### "Registry not found"

The registry identifier doesn't exist in the skill registry. Check available registries:

```bash
# View the registry file
curl https://raw.githubusercontent.com/Codeaholicguy/ai-devkit/main/skills/registry.json
```

### "Skill not found"

The skill doesn't exist in the specified registry. Explore the registry repository on GitHub to see available skills.

### "No skill-capable environments configured"

Your project doesn't have any skill-compatible environments. Run `ai-devkit init` and select an environment that supports skills (Cursor, Claude Code, Codex, OpenCode, or Antigravity).

### "SKILL.md not found"

The skill folder exists but doesn't contain a `SKILL.md` file, meaning it's not a valid skill. Contact the registry maintainer.
