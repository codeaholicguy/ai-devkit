# AI DevKit

> English | [中文](./README-zh.md)

**Your AI coding agent is fast, eager, and reckless. Make it work like a senior engineer instead.**

AI DevKit turns one-off AI coding chats into a repeatable software delivery workflow: requirements, design, planning, implementation, tests, verification, memory, and review.

- **Stops prompt-and-pray coding** — `/new-requirement` makes the agent clarify the problem before touching code
- **Blocks fake "done" claims** — `verify` requires fresh test/build output before completion claims
- **Keeps project knowledge alive** — `@ai-devkit/memory` stores decisions, conventions, and fixes across sessions
- **Catches drift before push** — `/code-review` audits the diff against the design and requirements docs

One config. All coding agents: Claude Code, Cursor, Codex CLI, Gemini CLI, GitHub Copilot, opencode, Antigravity, Amp, Windsurf, Kilo Code, Roo Code.

Run `npx ai-devkit@latest init` and your agent gets:

| What you need | What AI DevKit installs |
|---------------|-------------------------|
| A plan before code | `/new-requirement`, `/review-design`, and `/execute-plan` |
| Evidence before "done" | `verify` gates tied to fresh test/build output |
| Memory across sessions | Local SQLite memory exposed through MCP and CLI |
| Same behavior across agents | Generated config for the coding tools your team uses |

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

Before AI DevKit, your agent is a capable but inconsistent chatbot. After AI DevKit, it has a workflow, memory, verification gates, and reusable skills that travel with your repo.

| Without AI DevKit | With AI DevKit |
|-------------------|----------------|
| You repeat project rules in every chat | The agent searches project memory and docs first |
| The agent jumps from prompt to code | The agent moves through requirements, design, and plan |
| "Done" means the agent stopped editing | "Done" requires fresh verification output |
| Each agent needs separate hand-maintained rules | One config reconciles commands, skills, and MCP setup |

## Start in 30 seconds

```bash
npx ai-devkit@latest init
```

One wizard. Pick your agents, install the workflow, and give them the same operating model. It writes project-local files you can review and commit. Re-run it whenever your agent list or workflow changes.

Here's what lands in your repo:

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

### Or get the full engineering workflow stack

Save [`templates/senior-engineer.yaml`](./templates/senior-engineer.yaml) locally and run:

```bash
ai-devkit init --template ./senior-engineer.yaml
```

Bundles the eight built-in skills with curated additions from Anthropic, Vercel, and others — TDD, frontend design, webapp testing, doc co-authoring, React best practices, security review, and more.

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

## What changes in the agent

The flow above is powered by eight built-in skills, each addressing a failure mode developers see in real AI coding sessions:

| Failure mode | AI DevKit behavior |
|--------------|--------------------|
| Agent starts coding too early | `dev-lifecycle` forces requirements, design, planning, implementation, tests, and review |
| Agent says "done" without proof | `verify` blocks completion claims without fresh test/build evidence |
| Agent forgets project decisions | `memory` gives it a local, searchable knowledge base across sessions and projects |
| New behavior ships without tests | `tdd` pushes test-first implementation |
| Debugging becomes guess-and-patch | `structured-debug` makes it reproduce, hypothesize, fix, and verify |
| Existing code is opaque | `document-code` maps entry points, dependencies, and behavior |
| Implementation gets bloated | `simplify-implementation` reduces complexity before code ships |
| Documentation is hard to follow | `technical-writer` audits docs for novice-user clarity |

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
ai-devkit agent send "run the tests and report back" --id <agent-name> --wait

# Pipe multi-line output into a running session
npm test 2>&1 | ai-devkit agent send --id <agent-name> --stdin

# Pipe a session through Telegram — operate your agent from your phone
ai-devkit channel start telegram
```

Useful for long-running tasks, scheduled work, or checking on an agent from your phone at lunch.

## How is this different from `CLAUDE.md`, `.cursor/rules`, or `AGENTS.md`?

Those files are static instructions the agent re-reads. AI DevKit gives the agent a **workflow layer**: phase docs, slash commands, skills loaded on demand, local searchable memory, verification gates, and a control surface that works across agents. The rules still matter, but AI DevKit makes them operational.

| Static rules files | AI DevKit |
|--------------------|-----------|
| Tell the agent what you prefer | Installs commands that drive the next step |
| Depend on the agent remembering every rule | Stores and searches reusable project knowledge |
| Cannot prove a task is complete | Requires fresh command output before completion claims |
| Are different for each agent | Generates the right files for each supported agent |

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
