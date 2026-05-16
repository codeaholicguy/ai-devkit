# Backlog

Ideas and items to follow up on.

- [ ] Stop hardcoding `BUILTIN_SKILL_NAMES` in the CLI. Have `init` fetch the canonical list from a manifest in the registry repo (e.g., `skills/builtin.json`).
- [ ] Add daemon mode for `ai-devkit channel start` command.
- [ ] Add multiple Telegram channels support for `ai-devkit channel` — allow running multiple Telegram bots at the same time.
- [ ] Add agent session detail command.

## `agent send` Claude Code parity

Opportunity: `claude -p` / Agent SDK usage is moving to a separate credit pool, while interactive Claude Code remains available through Claude subscriptions. Make `npx ai-devkit agent send` useful as a scriptable interface to an existing interactive Claude Code session.

### Milestone 1: Wait for responses

- [ ] Add `--wait` to `npx ai-devkit agent send` so the command sends a prompt, polls the target agent transcript, prints new assistant output, and exits when the agent is waiting again.
- [ ] Add `--timeout <duration>` for `agent send --wait`, with a clear non-zero exit when the agent does not finish before the timeout.
- [ ] Add `--json` output for `agent send --wait`, including target agent metadata, sent prompt, captured response messages, elapsed time, and final status.
- [ ] Add `--stdin` support so scripts can pipe multi-line prompts into `agent send`.
- [ ] Add tests for transcript seeding so `--wait` prints only messages added after the send, not historical conversation content.

### Milestone 2: Script-friendly command surface

- [ ] Add `npx ai-devkit agent ask "<prompt>"` as a convenience wrapper around `agent send --wait`.
- [ ] Make `agent ask` default to assistant text only, with `--verbose` for routing and status details.
- [ ] Support `agent ask --id <agent>` for explicit target selection and fail clearly when multiple agents match.
- [ ] Support `agent ask --json` for automation-compatible output.

### Milestone 3: Managed interactive Claude sessions

- [ ] Add `npx ai-devkit agent start --type claude --name <name>` to launch an interactive Claude Code session in a managed tmux session.
- [ ] Persist a lightweight ai-devkit session registry with name, type, PID, cwd, tmux target, createdAt, and lastSeenAt.
- [ ] Teach `agent list`, `agent send`, and `agent ask` to prefer registry metadata when available, while still supporting discovered sessions.
- [ ] Add `npx ai-devkit agent stop --id <agent>` for managed sessions.

### Milestone 4: Queueing and safety

- [ ] Add per-agent send locking so concurrent sends fail with a clear message by default.
- [ ] Add `--queue` to enqueue prompts when the target agent is busy instead of failing.
- [ ] Add `--wait-until-ready` to wait for an agent to become ready before sending.
- [ ] Add `--fail-if-busy` as the strict automation mode for CI/scripts.
- [ ] Add warnings and docs for destructive prompts, billing expectations, and the difference between controlling an interactive session and using `claude -p`.

### Milestone 5: Output and UX polish

- [ ] Add `--stream` to print new assistant output as it appears, when transcript updates can support it reliably.
- [ ] Add `--include-user` to include the sent user prompt in rendered output.
- [ ] Add `--tail <n>` to include recent context before sending or in verbose output.
- [ ] Add `--save <file>` to write captured assistant output to a file.
- [ ] Document examples for replacing common `claude -p` usage with `npx ai-devkit agent ask` and `agent send --wait`.
