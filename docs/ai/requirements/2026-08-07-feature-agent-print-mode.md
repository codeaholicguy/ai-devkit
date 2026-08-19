---
phase: requirements
title: Claude Print-Mode Agents
description: Durable AI DevKit agents backed by synchronous Claude print-mode runs
---

# Claude Print-Mode Agents

## Problem Statement

AI DevKit currently models an agent as a continuously running interactive process. Agent identity, discovery, status, sending, and waiting all depend on a live PID, terminal, and provider transcript. This prevents users and orchestration from addressing a durable agent identity when they want Claude Code to run only for the duration of each message.

The feature must add a Claude-first print mode in which AI DevKit owns a stable logical agent identity and a minimal durable mapping to a caller-assigned Claude session UUID. Claude Code remains responsible for its native conversation transcript. Each message launches one synchronous, ephemeral `claude -p` process and later messages resume the exact same provider conversation.

### Terminology

- **Logical agent:** the durable AI DevKit identity created by `agent start --mode print`.
- **Provider session:** the Claude conversation identified by the caller-assigned Claude UUID.
- **Provider process:** one ephemeral `claude -p` child process.
- **Run:** processing one `agent send` message by one provider process.

The logical agent exists while no provider process is running. One logical agent owns exactly one Claude provider session in this feature.

## Goals & Objectives

### Primary goals

- Preserve the existing `ai-devkit agent start` and `ai-devkit agent send --id` user journey.
- Add `ai-devkit agent start --type claude --mode print --name NAME --cwd PATH`.
- Keep interactive mode as the default and leave its behavior unchanged.
- At durable-agent start:
  - validate the name, cwd, Claude executable, installed Claude version, and required print-mode capabilities without invoking a model;
  - generate a stable AI DevKit agent ID and a valid caller-assigned Claude session UUID;
  - persist a minimal durable local mapping and initial `ready` state;
  - do not launch Claude and do not create or discover a transcript.
- Resolve durable agents on send by exact stable agent ID or unique name.
- Atomically acquire a per-agent busy state before launching Claude; a concurrent send must fail clearly instead of waiting or queueing.
- Send the prompt through child-process stdin, never through command-line arguments.
- On the first send, synchronously invoke Claude with the equivalent of:

  ```text
  claude -p --session-id <uuid> --output-format stream-json --verbose
  ```

- On later sends, invoke the same mode with exact `--resume <uuid>`; never use `--continue`.
- Parse Claude stream JSON, verify the emitted provider session ID equals the stored caller-assigned UUID, capture the final result, and return the logical agent to `ready`.
- Keep durable agents visible in list and detail output with stable identity, provider, mode, cwd, `ready`/`running`/`degraded` state, session health, last activity, and last result.
- Detect interrupted or abandoned busy state safely and expose/recover it without permitting concurrent use of the same Claude session.
- Validate all behavior without a real or billable Claude prompt.

### Secondary goals

- Keep persistence and new types small and repository-consistent.
- Isolate provider execution enough for deterministic fake-provider tests.
- Preserve a clean future seam for other run-based providers without implementing them now.
- Provide JSON output that identifies durable agents without inventing a fake PID or terminal.

### Non-goals

- Queues, schedulers, servers, workers, daemons, or background sends.
- Channel integration or changes to channel behavior.
- Task attribution, receipt generation, or assurance automation.
- Cancellation or new kill/delete behavior.
- Transcript duplication, transcript parsing as the durable source of truth, or transcript cleanup.
- More than one provider session per logical agent.
- Print/headless adapters for Codex, Gemini, or any provider other than Claude.
- Interactive permission prompting or forwarding approvals from print-mode runs.
- Automatic retry of a failed run.
- Cross-host, shared, or multi-user agent storage.
- Changing existing interactive agent start, list, detail, send, wait, open, rename, kill, or channel semantics beyond the minimum additive resolution needed for durable agents.

## User Stories & Use Cases

### Create a durable agent

As an AI DevKit user, I can run:

```bash
ai-devkit agent start --type claude --mode print --name reviewer --cwd /repo
```

and receive a stable AI DevKit agent ID. Creation validates local configuration and persists an idle logical agent, but consumes no model tokens and creates no Claude transcript.

### Send the first message

As a user, I can run:

```bash
ai-devkit agent send --id reviewer "Review the authentication design"
```

AI DevKit resolves the unique durable-agent name, acquires its busy state, starts Claude synchronously, sends the prompt via stdin, streams/parses provider events, verifies the stored session UUID, records the outcome, and exits when the run is terminal.

### Resume the same context

As a user, I can send a later message to the stable agent ID or its unique name. AI DevKit resumes the exact stored Claude UUID in the same bound cwd so Claude retains conversation context.

### Observe an idle durable agent

As a user, I can list or inspect a durable agent even when no Claude process or transcript exists. The output distinguishes the durable logical agent from an interactive process and reports its session health and last run outcome.

### Reject concurrent sends

As a user or script, if one send already owns the agent, a second send exits non-zero with a clear busy error identifying the agent. It does not enqueue, wait, inject input, or start another Claude process.

### Recover from an interrupted caller

As a user, if the AI DevKit process dies after marking the agent busy, a later operation detects stale ownership using persisted owner/run metadata and process liveness. It must not steal a lock from a still-running owner. A genuinely abandoned state is recovered to a safe state and surfaced in detail/history metadata as a degraded or interrupted last result.

## Success Criteria

### CLI and compatibility

- `agent start` accepts `--mode interactive|print`; omitted mode is `interactive`.
- `--mode print` is accepted only with `--type claude` and rejects unsupported combinations before persistence.
- Existing interactive command tests remain unchanged or are augmented only for additive mode parsing.
- Existing interactive agents continue to use tmux/process detection and terminal input.
- `agent send --id` resolves both existing interactive agents and durable durable agents without ambiguous silent preference. Exact stable durable-agent ID wins; duplicate or ambiguous names produce an actionable error.
- Durable-agent sends are synchronous. Existing `--wait` behavior for interactive agents remains intact; print sends already wait for completion and must not introduce a second execution path.

### Identity and persistence

- Creation generates two distinct valid UUIDs: an immutable AI DevKit agent ID and immutable Claude session ID.
- The durable record stores only the information required for identity, binding, state, safe locking, and last-run display.
- Durable persistence uses an atomic, crash-safe local update convention consistent with the repository.
- Name uniqueness rules are explicit and deterministic for durable agents.
- A stored cwd is canonicalized and remains bound to the provider session; later sends cannot silently resume it from another cwd.
- Durable agents survive CLI process exit and remain listable without a provider PID.

### Provider execution

- No Claude process is spawned during `agent start --mode print`.
- The first send passes `-p`, `--session-id`, `--output-format stream-json`, and `--verbose` as discrete argv values.
- Later sends pass `-p`, `--resume`, the exact stored UUID, `--output-format stream-json`, and `--verbose`.
- Prompt content is written only to stdin and never appears in provider argv, normal status output, or error messages.
- The process cwd is exactly the canonical stored cwd.
- Every parseable provider event claiming a session ID must agree with the stored session ID; any mismatch fails the run and marks the agent degraded.
- Success requires a valid terminal result event and successful provider exit. Truncated output, malformed terminal output, session mismatch, or non-zero exit becomes a recorded failure/degraded result.
- Unknown stream event types are tolerated without treating their untrusted fields as trusted state.
- Provider stderr and errors are bounded and sanitized before persistence or user display.

### Busy locking and recovery

- Busy acquisition is atomic across concurrent CLI processes.
- Exactly one send may invoke a provider for a logical agent at a time.
- Busy metadata identifies the owning AI DevKit process and run start time sufficiently to distinguish a live owner from an abandoned state.
- Cleanup returns the agent to `ready` only if the finishing process still owns the busy marker.
- Provider failure before or after process spawn cannot leave a live owner incorrectly reported as available.
- Crash recovery never terminates an unknown process and never relies only on PID without enough metadata to mitigate PID reuse.

### List and detail

- Human and JSON list/detail output include stable ID, name, provider `claude`, mode `print`, canonical cwd, state, session health, last activity, and last result.
- No fake PID, tmux session, terminal, or transcript path is fabricated.
- Before first send, session health communicates that the caller-assigned identity is initialized but no provider transcript/run has yet been observed.
- A running durable agent is visible as `running`; a provider/session/protocol failure is visible as `degraded`; a successful or safely recovered agent is `ready`.

### Validation

- Tests inject a fake Claude executable or process launcher; no test invokes a real model.
- Deterministic fixtures cover initial session creation, resume, streaming chunks, final result, stderr, non-zero exit, malformed JSON, missing final result, session mismatch, concurrent sends, stale lock recovery, and cwd binding.
- Focused package tests, full relevant tests, typecheck, lint, build, coverage, security review, and fake-provider end-to-end validation pass.

## Constraints & Assumptions

### Product constraints

- This is an additive Claude-only print mode, not a redesign of all agent adapters.
- Synchronous execution is intentional. The process running `agent send` owns the provider child until completion.
- Concurrent sends fail immediately; there is no queue or implicit retry.
- Claude owns its native transcript and retention behavior. AI DevKit owns only the logical identity, binding, minimal state, and last result metadata.
- Durable agents have no terminal, so terminal-specific operations remain interactive-only and retain their existing semantics.

### Technical constraints

- `origin/main` at feature start is the authoritative code baseline.
- Use the repository's existing Node.js/TypeScript conventions and safe `execFile`/spawn-style argv separation.
- Persist locally beneath AI DevKit's existing user data area, using the smallest repository-consistent design selected during design review.
- Writes must be atomic and safe against symlink/path substitution where AI DevKit controls the target.
- Provider executable resolution must be injectable in tests and must not allow shell interpolation.
- Current local Claude Code is version `2.1.220`; implementation must rely only on documented flags confirmed by local help and official Claude documentation.
- Claude print sessions are resumable by explicit session ID and native transcripts are project-associated. The stored cwd/session binding is therefore security- and correctness-sensitive.
- Permission behavior remains Claude's configured behavior for this MVP. AI DevKit must not add `--dangerously-skip-permissions`, `bypassPermissions`, auto-approval flags, tool allowlists, hooks, MCP configuration, `--bare`, or other policy-changing flags implicitly.
- Because print mode cannot present interactive approval UI, denied/unapproved tool actions may cause provider failure; this must be reported clearly rather than bypassed.
- Provider stdout is an untrusted, incrementally delivered protocol stream. Parsing must be bounded and resilient to chunk boundaries.

### Security constraints

- Prompts and provider output may contain secrets and must not be logged by default.
- Prompt content must not appear in argv.
- Cwd must resolve to an existing directory at creation and remain safely bound thereafter.
- Durable store initialization and atomic replacement must reject unsafe symlink targets.
- Provider-reported session identity cannot overwrite the stored binding.
- Errors must avoid echoing prompts or unbounded raw provider output.
- A non-zero exit or malformed/mismatched output must never be presented as success.
- Existing interactive behavior must not be weakened by print-mode resolution or persistence.

### Assumptions accepted for MVP

- Local single-user execution is the supported deployment model.
- A valid local Claude CLI and authentication already exist; start validates the executable/version/capability surface without validating credentials through a model call.
- The Claude CLI persists a new print session on the first actual run, not at logical-agent creation.
- Last result is a bounded summary/status suitable for list/detail, not a transcript copy.
- Stable agent IDs are displayed in full JSON and may be shortened for human output only when unambiguous.

## Alternatives Considered

1. **Extend the current JSON registry with durable print records — recommended starting point if atomic cross-process locking can be made safe with a small dedicated store.** Reuses repository conventions and minimizes dependencies, but the live registry's PID-pruning semantics must not own durable records.
2. **Create a small dedicated SQLite agent database.** Strong transactions and locking, but introduces a larger persistence surface than this MVP may need.
3. **Discover Claude transcripts and treat them as agents.** Rejected because creation must predate transcripts, stable AI DevKit identity differs from provider session identity, and filesystem discovery is not an authorization or ownership boundary.

The design phase must choose between a dedicated atomic JSON store and a minimal SQLite store based on demonstrated locking/crash-safety needs, without introducing speculative run/event schemas.

## Questions & Open Items

No blocking product questions remain. The following are design decisions constrained by the acceptance criteria:

- Select the smallest persistence mechanism that provides atomic busy acquisition and safe stale-owner recovery.
- Define the exact bounded last-result and session-health representation.
- Define deterministic resolution behavior when an interactive and durable agent share a name.
- Define the supported Claude capability/version probe using `--version` and `--help` without invoking a model.
- Define how `agent send --wait`, `--timeout`, and `--json` render for an already-synchronous print send while preserving interactive behavior.
