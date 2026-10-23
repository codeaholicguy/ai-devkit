---
title: Status & Capacity
description: Check setup health with status and monitor provider quota with capacity before starting agents.
slug: capacity
section: reference
order: 2
---

Two operational commands answer the questions you hit every day: is my setup healthy (`status`), and which agent has quota left (`capacity`).

## Status

`ai-devkit status` prints a readiness report for your whole setup:

```bash
ai-devkit status
ai-devkit status --json
```

The report covers the CLI version (and whether npm has a newer one), the project config, per-agent readiness (executable found, authentication, skills installed), tmux, skill registries, channels, and per-agent memory MCP wiring. Run it first when something feels off.

Treat auth and readiness rows as hints: some harnesses show `ready` without a successful login probe, and others show `auth fail` when a login-free model path still works. For orchestration, prefer a real `agent start` plus `send` handshake (see [Multi-agent orchestration](/docs/17-multi-agent-orchestration)).

## Capacity

`ai-devkit capacity` shows remaining quota across your logged-in providers so you can pick the agent type with the most headroom:

```bash
ai-devkit capacity
ai-devkit capacity codex claude
ai-devkit capacity --json
```

Supported providers: `codex`, `zai` (or `z.ai`), `openai`, `anthropic`, `claude`, `devin`. With no arguments, all providers are queried; pass provider names to check a subset. Output is a per-quota table with usage bars and humanized reset times; `--json` gives the raw report for scripting.

Capacity reads the credentials each provider's own tool already stores on your machine — no extra setup is needed. A provider you have not logged into reports as unauthenticated instead of showing quota.

Before starting a managed agent, check the provider behind your chosen `--type`: if it reports `available: "no"` or a window near exhaustion, pick another agent type whose provider has headroom — `status` shows which alternatives are healthy on your machine.

## Next Steps

- **[Runtime (devkitd)](/docs/16-runtime)**: the daemon that powers agent detection and coordination
- **[Agent Management](/docs/8-agent-management)**: start and supervise agents once you know they have capacity
