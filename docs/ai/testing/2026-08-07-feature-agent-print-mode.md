---
phase: testing
title: Claude Print-Mode Agent Testing Strategy
description: Offline TDD, security, integration, and compatibility validation
---

# Claude Print-Mode Agent Testing Strategy

## Test Coverage Goals

- Target 100% branch/function coverage for new durable-agent repository, probe, parser, runner, and orchestration modules.
- Cover every requirements success criterion and design state transition.
- Keep all provider tests offline and non-billable.
- Re-run existing agent-manager and CLI suites to prove interactive compatibility.
- Treat untested error, locking, parsing, and path-safety branches as blocking gaps unless explicitly justified.

## Unit Tests

### Durable agent repository and resolution

- [ ] Creates a durable durable agent with distinct valid AI DevKit and Claude UUIDs.
- [ ] Canonicalizes an existing cwd and rejects missing/non-directory paths.
- [ ] Rejects duplicate durable-agent names case-insensitively.
- [ ] Resolves an exact stable ID and unique exact name without partial print-name matching.
- [ ] Treats a missing store as empty and rejects malformed or unsupported-version storage.
- [ ] Persists with atomic replacement and owner-only file permissions.
- [ ] Rejects symlinked parent, store, temp, mutation-lock, execution-lock, and owner metadata paths.
- [ ] Bounds mutation-lock waiting and reports contention.

### Busy locking and recovery

- [ ] Acquires one per-agent run lock and atomically records `running` state.
- [ ] Rejects a concurrent acquisition as busy without waiting or spawning.
- [ ] Uses an ownership token so a late finisher cannot clear another run.
- [ ] Records provider PID plus OS start identity before prompt delivery.
- [ ] Retains busy state while the exact owner or provider process remains alive.
- [ ] Does not trust a recycled PID with a different start identity.
- [ ] Fails closed for young incomplete/corrupt lock metadata.
- [ ] Recovers a genuinely abandoned lock as `degraded` with interrupted last result.
- [ ] Never signals a process during reconciliation.
- [ ] Restores `ready/healthy` after a later successful run.

### Claude CLI capability probe

- [ ] Runs only injected `claude --version` and `claude --help` commands.
- [ ] Accepts help containing all required print/session/stream flags.
- [ ] Rejects a missing executable, non-zero probe, or missing required capability.
- [ ] Returns a bounded sanitized version and never invokes a model prompt.

### Claude stream parser and runner

- [ ] Builds initial argv with `-p --session-id UUID --output-format stream-json --verbose`.
- [ ] Builds resume argv with exact `-p --resume UUID --output-format stream-json --verbose`.
- [ ] Never includes prompt text or `--continue` in argv.
- [ ] Uses `shell: false` and exact canonical cwd.
- [ ] Persists provider identity through `onSpawn` before writing prompt bytes to stdin.
- [ ] Handles JSON split across stdout chunks and multibyte UTF-8 boundaries.
- [ ] Accepts unknown event types while verifying every present string session ID.
- [ ] Requires exactly one valid terminal result and exit code 0 for success.
- [ ] Rejects session mismatch, malformed JSON, non-object JSON, oversized line, missing result, duplicate result, invalid result text, and non-zero exit.
- [ ] Bounds and sanitizes stderr and persisted result summary.
- [ ] Does not persist prompt, full stdout, tool input, or transcript content.

### Print service

- [ ] Start validates configuration before persistence and never spawns Claude.
- [ ] First send acquires, invokes initial session, verifies result, and completes ready.
- [ ] Later send invokes exact resume session.
- [ ] Failure records degraded state and releases only the owned lock.
- [ ] Busy failure returns before runner invocation.
- [ ] Timeout/failure does not retry automatically.

### CLI command behavior

- [ ] Omitted `--mode` routes to existing interactive start unchanged.
- [ ] `--mode interactive` routes to existing interactive start unchanged.
- [ ] `--mode durable` accepts Claude only and rejects other provider combinations.
- [ ] Print start displays stable identity and does not display PID/tmux attach instructions.
- [ ] List merges live and durable rows without fake PID/session file values.
- [x] List table and JSON label live agents as `interactive` and internal print-mode agents as `durable`, without leaking `print` in list presentation.
- [ ] Detail renders provider, mode, cwd, state, health, activity, and last result.
- [ ] Direct send resolves exact print ID, unique names, and reports cross-mode ambiguity.
- [ ] Existing live partial resolution remains available when no print exact name matches.
- [ ] Print `--wait`, `--timeout`, and `--json` follow the documented synchronous behavior without changing interactive behavior.
- [ ] Groups, open, rename, kill, channels, and TUI remain on live-agent paths.

## Integration Tests

- [ ] Temporary store create → list → detail works with no provider process or transcript.
- [ ] Fake provider first send records the caller-assigned session and returns ready.
- [ ] Second fake-provider send uses exact resume UUID and preserves stable agent ID.
- [ ] Two concurrent service instances against one store produce one run and one busy failure.
- [ ] Simulated parent crash with a live recorded provider retains busy state.
- [ ] Simulated dead owner/provider recovers degraded state, then permits a successful later send.
- [ ] Provider session mismatch cannot mutate the stored binding.
- [ ] Cwd replacement/symlink change after creation blocks send.
- [ ] Store failure after spawn occurs before prompt delivery.
- [ ] Existing agent-manager and CLI suites remain green.

## End-to-End Tests

- [ ] Invoke the built CLI with an injected fake `claude` executable, temporary HOME/store, and temporary cwd.
- [ ] Run `agent start --type claude --mode durable`, verify no fake-provider invocation and no transcript fixture.
- [ ] Run first `agent send`, verify captured argv/session ID, stdin prompt, cwd, stream result, and ready state.
- [ ] Run second `agent send`, verify exact `--resume`, same provider UUID, and updated last result.
- [ ] Hold one fake run open and verify a second CLI send exits non-zero with a clear busy error.
- [ ] Verify JSON list/detail/send output omits prompt and fake PID/terminal fields.

## Test Data

- Temporary directories for HOME, store, lock root, and bound project cwd.
- Deterministic UUID/time/process-inspector injections.
- Fake Claude executable or spawn boundary supporting:
  - `--version` and `--help` responses;
  - invocation capture without prompt argv;
  - stdin capture;
  - deterministic initial/resume stream fixtures;
  - chunked and multibyte output;
  - delayed completion for concurrency;
  - malformed/oversized/mismatched/missing/duplicate result output;
  - bounded/unbounded stderr attempts;
  - configurable exit code.
- No real Claude authentication, API request, transcript, hook, MCP server, or model prompt.

## Test Reporting & Coverage

- Focused red/green cycles: package-specific Vitest test paths.
- Agent manager: `npx nx run agent-manager:test` and coverage target invocation.
- CLI: `npx nx run cli:test` and coverage target invocation.
- Relevant full suite: repository-native test target(s) determined from `package.json`/Nx.
- Static checks: feature/base AI DevKit lint, ESLint, TypeScript typecheck, and build.
- Security: formal `security-review` against requirements, design, diff, dependencies, and validation output.
- Final review: holistic `dev-review`, followed by rebase and the same fresh validation set.
- Record exact command outputs and any justified coverage gap in this document during Phase 8.

## Manual Testing

- No real Claude prompt is permitted.
- Human inspection is limited to CLI help/output snapshots and fake-provider validation.
- Verify error messages are actionable without disclosing prompts, raw secrets, or unsafe paths.

## Performance Testing

- [ ] Verify list/read performance remains practical with at least 100 synthetic print records.
- [ ] Verify lock contention fails within the configured bounded interval.
- [ ] Verify oversized provider lines and stderr do not cause unbounded memory growth.

## Bug Tracking

- Blocking correctness/security issues discovered during implementation are added to the planning document immediately.
- Every fix follows a new red/green/refactor TDD cycle.
- No external issue is created unless separately requested.
