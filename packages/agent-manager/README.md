# @ai-devkit/agent-manager

Detect, inspect, and send prompts to running AI coding agent sessions.

This package powers the `ai-devkit agent` commands. Use it when you need the lower-level agent session management utilities that AI DevKit uses to find active Claude Code, Codex, Gemini CLI, and other supported coding-agent sessions.

## What It Provides

- **Session detection** — Find running agent sessions across supported providers
- **Session details** — Inspect agent metadata, working directory, and status
- **Prompt sending** — Send follow-up instructions to an existing session
- **Provider adapters** — Shared adapter layer for agent-specific behavior
- **Terminal control** — Discover, focus, and type into the terminal pane that
  hosts a running agent. Supported emulators: **tmux**, **WezTerm**, **iTerm2**,
  and macOS **Terminal.app**. Resolution is automatic from the agent PID's TTY.

## Typical Use

Most users should use the CLI:

```bash
ai-devkit agent list
ai-devkit agent send "run the tests and report back" --id <agent-name> --wait
npm test 2>&1 | ai-devkit agent send --id <agent-name> --stdin
```

Use this package directly only when building custom tooling around AI DevKit's agent detection and control surface.

## Documentation

Full guides and workflow examples: **[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

MIT
