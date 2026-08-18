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

Claude Code can also be registered as a durable print-mode agent. Registration
does not launch Claude; each send starts one synchronous process and later sends
resume the same Claude session:

```bash
ai-devkit agent start --type claude --mode print --name reviewer --cwd /path/to/project
ai-devkit agent send "review the current diff" --id reviewer
```

Print mode inherits Claude Code's settings, permissions, hooks, MCP servers, and
tool side effects for that working directory. AI DevKit adds no permission bypass
or automatic retry, and prompts are delivered over stdin rather than command-line
arguments. `--timeout` is not supported for print agents in this first release.

Durable print-agent state is stored in `~/.ai-devkit/agents.db`. On the first
writable open after upgrading, a valid `~/.ai-devkit/print-agents.json` is
imported once and renamed to `print-agents.json.migrated-v1.bak`. There is no
dual-write: rollback to an older binary requires exporting the SQLite state
before that binary is allowed to write its JSON store again.

For direct `PrintAgentStore` consumers, `dbPath` selects the SQLite database.
The legacy `filePath` option remains available for one compatibility release as
the JSON import path (and maps injected `.json` test paths to `.db`). The
`lockTimeoutMs`, `incompleteLockGraceMs`, and `mutationLockStaleMs` options are
deprecated, accepted, and ignored because SQLite transactions replace the
filesystem lock machinery.

Use this package directly only when building custom tooling around AI DevKit's agent detection and control surface.

## Documentation

Full guides and workflow examples: **[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

MIT
