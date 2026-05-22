---
title: Use ai-devkit agent send --wait for Programmatic Agent Calls
description: Use ai-devkit agent send --wait to call an existing interactive Claude Code, Codex, Gemini CLI, or OpenCode session from scripts and automation.
order: 11
---

`ai-devkit agent send --wait` lets a script send a prompt to an already-running interactive coding agent, wait for the next assistant response, and print that response to stdout.

This is useful when you want the ergonomics of an interactive agent session but need a programmatic interface similar to `claude -p` or `codex exec`.

## Prerequisites

Before using this workflow:

- Install AI DevKit and make sure `ai-devkit` is available in your shell.
- Start Claude Code, Codex, Gemini CLI, or OpenCode in the project you want to control.
- Keep that agent running in a supported terminal session such as tmux, iTerm2, or Apple Terminal.
- Run `ai-devkit agent list` and confirm the session appears.

## Quick Example

Start your coding agent normally in one terminal:

```bash
claude
# or codex
# or gemini
# or opencode
```

In another terminal, find the session identifier:

```bash
ai-devkit agent list
```

Look for the `Agent` column. Use that value, or a unique partial match, as `--id`.

```text
Agent        CWD                  Type         Status
my-project   ~/code/my-project    Claude Code  wait
```

Then send a prompt and wait for the response:

```bash
ai-devkit agent send "Summarize the current git diff and identify risks." --id my-project --wait
```

The assistant response is printed to stdout. Status messages and warnings are written to stderr, so scripts can pipe or capture the response cleanly.

## Why use this instead of claude -p or codex exec?

Use `agent send --wait` when you want to talk to an existing interactive session instead of starting a fresh one-off process.

That means the agent keeps its current:

- conversation context
- working directory
- loaded project state
- configured tools and MCP servers
- authentication and permission state
- terminal session and interactive approvals

This makes it a strong fit for automation that should continue work inside the same Claude Code, Codex, Gemini CLI, or OpenCode session.

## When should I still use claude -p or codex exec?

Use a native non-interactive command when you want a brand-new isolated run, predictable startup behavior, and no dependency on a live terminal session.

Use `ai-devkit agent send --wait` when the existing interactive session is the feature: you want to preserve context, reuse approvals, and keep the session visible for a human to inspect.

| Use case | Prefer |
|---|---|
| Continue an existing interactive session with its current context | `ai-devkit agent send --wait` |
| Run a fresh one-off prompt with no dependency on a live terminal | `claude -p` or `codex exec` |
| Script against stdout while preserving agent session context | `ai-devkit agent send --wait` |
| CI job that must not depend on a human terminal session | Native non-interactive command |

## Which agents are supported?

`agent send --wait` uses the same experimental agent detection system as `ai-devkit agent list`.

Current interactive adapters include:

- Claude Code
- Codex
- Gemini CLI
- OpenCode

Support depends on AI DevKit being able to detect the live process, find its terminal, and read its session transcript.

Run this to confirm what AI DevKit can see on your machine:

```bash
ai-devkit agent list
```

## How do I select the target session?

Use `--id` with the agent name or a unique partial match from `agent list`.

```bash
ai-devkit agent send "What are you working on?" --id frontend --wait
```

If multiple agents match the same identifier, AI DevKit asks you to use a more specific value.

For scripts, prefer exact or highly specific identifiers.

## Can I pipe a prompt from stdin?

Yes. Use `--stdin`, or pipe input without a message argument.

```bash
git diff -- src/ tests/ | ai-devkit agent send --id my-project --stdin --wait
```

You can also compose a prompt around command output:

```bash
{
  printf 'Review this diff for bugs and missing tests:\n\n'
  git diff
} | ai-devkit agent send --id my-project --stdin --wait
```

## Can I get JSON output?

Yes. Add `--json` with `--wait`.

```bash
ai-devkit agent send "Return a short implementation plan." --id my-project --wait --json
```

The JSON output includes the target metadata, prompt, captured response messages, elapsed time, and final agent status.

This is useful when your script needs more than plain text:

```bash
response_json="$(ai-devkit agent send "List the next 3 tasks." --id my-project --wait --json)"
printf '%s\n' "$response_json"
```

## How long does --wait wait?

By default, AI DevKit waits up to 10 minutes.

Use `--timeout` to set a custom limit in milliseconds:

```bash
ai-devkit agent send "Run the focused tests and report failures." --id my-project --wait --timeout 30000
```

`--timeout` only works together with `--wait`.

## What exactly is printed?

In plain text mode, AI DevKit prints new assistant messages created after the prompt was sent.

It does not print older conversation history, and it does not print the user prompt back to stdout.

Warnings, status messages, and timeout errors are sent to stderr. This keeps stdout suitable for command substitution and pipelines.

## Does this execute commands directly?

No. AI DevKit sends text into the agent's existing terminal session. The agent decides how to respond, including whether it needs to ask for tool approval or run commands through its normal interactive flow.

This is why `agent send --wait` can be a practical bridge between automation and interactive coding agents: scripts can request work, while the agent still follows its normal permission and tool behavior.

## What are common failure cases?

### No running agents found

Start Claude Code, Codex, Gemini CLI, or OpenCode first, then run:

```bash
ai-devkit agent list
```

### No agent found matching the id

Check the displayed agent names:

```bash
ai-devkit agent list
```

Then pass a more specific `--id`.

### Cannot find terminal for the agent

AI DevKit needs to find the terminal that owns the running agent process. The most reliable setups are tmux, iTerm2, and Apple Terminal.

On macOS, terminal focusing and sending may require Accessibility permissions for your terminal application.

### Timed out waiting for response

The agent did not return to a waiting or idle state before the timeout. Increase `--timeout`, check the interactive terminal, or answer any approval prompt the agent is waiting on.

## Example: shell helper function

```bash
ask_agent() {
  local agent_id="$1"
  shift
  ai-devkit agent send "$*" --id "$agent_id" --wait
}

ask_agent my-project "Explain the failing test and suggest the smallest fix."
```

## Example: use an agent as a review step

```bash
review_output="$(
  {
    printf 'Review this change. Focus on bugs, regressions, and missing tests.\n\n'
    git diff --stat
    printf '\n'
    git diff
  } | ai-devkit agent send --id my-project --stdin --wait --timeout 120000
)"

printf '%s\n' "$review_output"
```

## Mental model

`claude -p` and `codex exec` are closer to "start a new programmatic run."

`ai-devkit agent send --wait` is closer to "send a message to the interactive agent I already have running, then wait until it answers."

Choose the second model when session continuity matters.
