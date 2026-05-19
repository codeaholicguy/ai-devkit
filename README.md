# AI DevKit

> English | [中文](./README-zh.md)

**Your AI coding agent is fast, eager, and reckless. Make it work like a senior engineer instead.**

- **Plans before it codes** — `/new-requirement` generates a phased doc; the agent stops before writing code
- **Refuses to fake "done"** — the `verify` skill blocks completion claims without fresh test/build output
- **Remembers what you taught it** — `@ai-devkit/memory` MCP server, searchable across sessions and projects
- **Reviews its own work** — `/code-review` audits the diff against the design doc before push

One config. Eleven coding agents: Claude Code, Cursor, Codex CLI, Gemini CLI, GitHub Copilot, opencode, Antigravity, Amp, Windsurf, Kilo Code, Roo Code.

[![npm version](https://img.shields.io/npm/v/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![npm downloads](https://img.shields.io/npm/dt/ai-devkit.svg)](https://www.npmjs.com/package/ai-devkit)
[![GitHub stars](https://img.shields.io/github/stars/Codeaholicguy/ai-devkit.svg?style=social)](https://github.com/Codeaholicguy/ai-devkit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Who this is for

Developers who use AI coding agents daily and are tired of:

- re-rigging `CLAUDE.md` / `.cursor/rules` / `AGENTS.md` for every project
- the agent forgetting yesterday's conventions
- "I've successfully implemented the feature" with a red build
- the agent diving into code without a plan and producing the wrong thing

## Start in 30 seconds

```bash
npx ai-devkit@latest init
```

One wizard. Picks your agents, scaffolds a structured workflow, and installs eight built-in skills that change how the agent behaves. Here's what lands in your repo:

```
your-project/
├── .ai-devkit.json              # single source of truth (re-run init anytime)
├── .claude/                     # or .cursor/, .codex/, etc. per agent you picked
│   ├── skills/                  # dev-lifecycle, verify, memory, tdd, ...
│   ├── commands/                # /new-requirement, /execute-plan, /code-review, ...
│   └── settings.json            # MCP servers wired up (incl. @ai-devkit/memory)
└── docs/ai/
    ├── requirements/            # phase 1 — what to build, why
    ├── design/                  # phase 2 — how it'll be built
    ├── planning/                # phase 3 — task-by-task plan
    ├── implementation/          # phase 4 — execution notes
    └── testing/                 # phase 5 — coverage strategy
```

### Or get the full senior-engineer stack

Save [`templates/senior-engineer.yaml`](./templates/senior-engineer.yaml) locally and run:

```bash
ai-devkit init --template ./senior-engineer.yaml
```

The eight built-in skills plus: `frontend-design`, `webapp-testing`, `doc-coauthoring` (Anthropic), `react-best-practices`, `composition-patterns`, `web-design-guidelines`, `next-best-practices` (Vercel), `supabase-postgres-best-practices` (Supabase). Sixteen skills, three agents (Claude Code, Cursor, Codex), one command.

## A feature, end-to-end

```
You:    /new-requirement add OAuth login with Google

Agent:  Searches memory for prior auth conventions. Asks clarifying
        questions about scope, users, success criteria. Drafts
        docs/ai/{requirements,design,planning}/feature-oauth-login.md
        in a feature worktree. Stops before coding.

You:    /review-design feature-oauth-login

Agent:  Audits the design doc against the requirements. Flags gaps,
        proposes fixes — before any code gets written.

You:    /execute-plan feature-oauth-login

Agent:  Works the planning doc task-by-task. Updates progress after
        each task. The `verify` skill blocks a task from being
        marked done without fresh test/build output.

You:    /code-review

Agent:  Audits the diff against the design doc — scope creep,
        missing tests, edge cases the requirements named —
        before you push.
```

## The skills behind it

The flow above is powered by eight built-in skills, each addressing one failure mode:

| Skill | What it changes |
|-------|-----------------|
| `dev-lifecycle` | Phased workflow with checkpoints, so the agent plans before it codes |
| `verify` | Blocks completion claims without fresh test/build evidence |
| `memory` | FTS5-indexed knowledge base the agent searches before non-trivial work — persists across sessions and projects |
| `tdd` | Test-first discipline for new behavior |
| `structured-debug` | Reproduce → hypothesize → fix → verify, instead of guess-and-patch |
| `document-code` | Maps a module's entry points, dependencies, and behavior |
| `simplify-implementation` | Reduces complexity before code ships |
| `technical-writer` | Audits docs for novice-user clarity |

Need more? `ai-devkit skill add <registry> <skill>` pulls from 30+ publishers — Anthropic, Vercel, Supabase, Microsoft, Google.

## Works with every coding agent

One `.ai-devkit.json` configures all of them. Add a new agent to your team without rewriting your rules.

| Agent | Setup | Remote control |
|-------|-------|----------------|
| [Claude Code](https://www.anthropic.com/claude-code) | yes | yes |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli) | yes | yes |
| [Codex CLI](https://github.com/openai/codex) | yes | yes |
| [opencode](https://opencode.ai/) | yes | testing |
| [Cursor](https://cursor.sh/) | yes | — |
| [GitHub Copilot](https://code.visualstudio.com/) | yes | — |
| [Antigravity](https://antigravity.google/) | yes | — |
| [Amp](https://ampcode.com/) | yes | — |
| [Windsurf](https://windsurf.com/) | testing | — |
| [Kilo Code](https://github.com/Kilo-Org/kilocode) | testing | — |
| [Roo Code](https://roocode.com/) | testing | — |

**Setup** — `ai-devkit init` writes the agent's config (rules, MCP servers, skills, slash commands) so it follows the same workflow.
**Remote control** — drive running sessions from `ai-devkit agent send` and route them through external channels.

## Operate agents like infrastructure

AI DevKit also ships an agent control plane — drive sessions from the CLI, supervise from anywhere:

```bash
# List running sessions across providers
ai-devkit agent list

# Send a prompt to a running session and wait for the response
ai-devkit agent send <session-id> "run the tests and report back" --wait

# Pipe a session through Telegram — operate your agent from your phone
ai-devkit channel start telegram
```

Useful for long-running tasks, scheduled work, or checking on an agent from your phone at lunch.

## How is this different from `CLAUDE.md` or `.cursor/rules`?

Those are static instructions the agent re-reads each turn. AI DevKit gives the agent a **runtime**: a phased workflow with checkpoints, skills loaded on demand, a searchable memory the agent maintains itself, and a control surface that works the same across agents. One config, every tool.

## What this isn't

- **Not a smarter LLM.** Bad models stay bad — this raises the floor on process, not on raw capability.
- **Not a magic "write the feature for me" button.** You still review the requirements doc, accept the design, and read the diff. The workflow makes that review *possible* (artifacts to point at) instead of impossible (chat scrollback).
- **Not a hosted service.** MIT-licensed, runs locally, no telemetry. Memory is a SQLite file on your disk. The agent control plane talks to the agent SDKs you already use.

## Documentation & community

- Full guides, workflow patterns, skill authoring → **[ai-devkit.com/docs](https://ai-devkit.com/docs/)**
- Release notes → **[CHANGELOG.md](./CHANGELOG.md)**
- Contributing → **[CONTRIBUTING.md](./CONTRIBUTING.md)**

```bash
git clone https://github.com/Codeaholicguy/ai-devkit.git
cd ai-devkit && npm install && npm run build
```

## License

MIT
