---
phase: requirements
title: AI DevKit Status Command
description: Define a read-only setup and readiness report for AI agent managers
feature: status-command
---

# Requirements: AI DevKit Status Command

## Problem Statement

AI agents using the existing agent-management and agent-orchestration workflows must currently inspect multiple commands, configuration files, provider directories, hooks, and executables before they can determine whether AI DevKit is ready to manage Codex, Pi, and Claude. The checks are fragmented, their failure behavior is inconsistent, and some apparent setup states do not prove that the required integration is healthy.

The new `ai-devkit status` command must provide one read-only, machine-readable setup and readiness report. Its primary caller is an AI agent-manager deciding whether the local AI DevKit installation, supported agents, hooks, skills, terminal runtime, channels, registries, and current project configuration are usable. Human-readable output may summarize the same report, but JSON is the canonical contract.

## Goals & Objectives

### Primary goals

1. Report the ten approved setup and readiness checks in one command:
   1. Agent executables on `PATH`.
   2. Agent global configuration directories.
   3. AI DevKit built-in skills installed for each agent.
   4. AI DevKit hooks, including Codex session-mapping file health.
   5. Authentication state for each agent.
   6. tmux availability.
   7. Channel connection readiness and channel configuration validity.
   8. Configured project and global skill registries.
   9. Installed AI DevKit version compared with the latest npm version.
   10. Current project configuration presence and validity.
2. Make JSON the canonical representation, with checks nested under their owning agent or subsystem.
3. Give every check a normalized `pass`, `warn`, or `fail` status while retaining concrete evidence such as paths, counts, missing items, and safe error details.
4. Treat missing, invalid, unavailable, or unauthenticated components as reportable findings rather than fatal command errors whenever a structurally useful report can still be produced.
5. Never expose credentials, tokens, session contents, or other secrets.

### Secondary goals

- Keep each check independently useful so an agent-manager can make decisions without parsing human prose.
- Distinguish absence, invalid configuration, failed probes, and unknown state instead of collapsing them into a generic unavailable result.
- Preserve specialized commands as the authoritative interfaces for live agents, full capacity, sessions, channels, tasks, memory, and Git details.

### Non-goals and rejected scope

The following are explicitly excluded:

- Skill index existence or freshness.
- Live agent list or agent details.
- Historical session inventory.
- Full capacity or quota detail.
- Live channel bridge or process status.
- Skill registry cache state or refresh.
- Full project or global skill inventory beyond the required AI DevKit built-in set.
- Full Git status, branches, worktrees, or diffs.
- Task and memory database contents.
- Generic host diagnostics such as CPU, RAM, disk, Node/npm versions, or general network health.
- Automatic repair, installation, login, hook rewriting, registry fetching, or any other mutation.

## User Stories & Use Cases

1. As an AI agent-manager, I want to know which of Codex, Pi, and Claude have an executable, global configuration, authentication, built-in skills, and required integration hooks so I can choose a usable worker without guessing.
2. As an AI agent-manager, I want missing and degraded components represented in otherwise valid JSON so I can distinguish a setup blocker from a command failure.
3. As an AI agent-manager, I want channel readiness and configuration errors summarized without secret values so I can determine whether remote interaction is locally configured.
4. As a maintainer, I want status evidence tied to authoritative files and existing provider probes so the command does not maintain a second speculative setup model.
5. As a user, I want to know whether the installed AI DevKit CLI is behind the latest npm release without losing the rest of the report when npm is unavailable.

### Key workflow

1. The caller runs `ai-devkit status --json` from a project directory.
2. The command evaluates every locally available check independently.
3. It emits one JSON object even when individual agents, files, auth probes, tmux, channel configuration, npm, or project configuration are missing or invalid.
4. The caller uses per-agent and subsystem statuses, evidence, and errors to decide whether to continue, select another agent, or request setup remediation.

## Functional Requirements

### FR-01: Agent executables on `PATH`

- Check `codex`, `pi`, and `claude` independently using executable resolution against the current process `PATH`.
- Report the command name and resolved executable path when found.
- A missing executable must fail that agent's executable check without preventing checks for other agents or subsystems.

### FR-02: Agent global configuration directories

- Check existence and readability of `~/.codex`, `~/.pi`, and `~/.claude`.
- Report the expected path and its state beneath the corresponding agent.
- A missing or unreadable directory must be reported and must not abort the command.

### FR-03: AI DevKit built-in skills per agent

- Compare the canonical AI DevKit built-in skill set with the applicable global skill directory:
  - Codex: `~/.codex/skills/<skill>/SKILL.md`.
  - Pi: `~/.pi/agent/skills/<skill>/SKILL.md`.
  - Claude: `~/.claude/skills/<skill>/SKILL.md`.
- Report required and present counts plus the exact missing skill names.
- Do not inspect or report skill index existence or freshness.
- Do not expand this check into a full inventory of non-built-in skills.

### FR-04: AI DevKit hooks and session integration

#### Codex

- Check that `~/.codex/hooks/codex-session-mapping.cjs` exists and is readable.
- Check whether the installed script matches the bundled AI DevKit asset.
- Parse `~/.codex/hooks.json` and verify a `SessionStart` command hook exactly registers `node ~/.codex/hooks/codex-session-mapping.cjs`.
- Check `~/.codex/ai-devkit/sessions.json` independently for presence and valid JSON.
- Validate that mapping entries use PID keys and session-file path values.
- Count invalid entries and mappings whose referenced session files no longer exist.
- A missing mapping file is a warning because the hook may not have run yet; malformed mapping data is a failure.
- Never return mapped session contents.

#### Claude

- Check that `~/.claude/hooks/claude-prompt-hook.js` exists and is readable.
- Check whether the installed script matches the bundled AI DevKit asset.
- Parse `~/.claude/settings.json` and verify a `PreToolUse` command hook exactly registers `node ~/.claude/hooks/claude-prompt-hook.js`.

#### Pi

- Check whether `@ai-devkit/pi-session-tracker` is registered with Pi.
- Check `~/.pi/agent/sessions.json`, when present, for valid JSON containing PID-to-session-path entries.
- A missing sessions registry is a warning because no Pi session may have started yet; malformed registry data is a failure.
- Never return tracked session contents.

### FR-05: Authentication state per agent

- Report `authenticated`, `unauthenticated`, or `unknown` separately from the normalized check status.
- Codex must reuse the existing read-only Codex authentication probe backed by `CODEX_HOME/auth.json` or `~/.codex/auth.json`.
- Claude must use the provider-native, read-only `claude auth status --json` probe.
- Pi may inspect only the presence and structural validity of `~/.pi/agent/auth.json`; if that evidence cannot prove current credential validity, report `unknown`, not `authenticated`.
- Authentication checks must not invoke a model turn, refresh credentials, log in, or emit credential material.
- Full provider capacity and quota data remains excluded.

### FR-06: tmux availability

- Resolve `tmux` on `PATH` and run `tmux -V` as a read-only usability probe.
- Report the resolved path, availability, and returned version.
- The check does not require a running tmux server or an existing tmux session.

### FR-07: Channel readiness and configuration validity

- Read `~/.ai-devkit/channels.json` without mutating it.
- Report file presence, JSON validity, root schema validity, per-entry schema validity, and safe validation errors.
- For each configured channel, report its name, type, enabled state, credential presence, authorization state where applicable, local readiness, and normalized status.
- Telegram is locally ready only when enabled with a non-empty bot token, non-empty bot username, and an authorized chat ID.
- Slack is locally ready only when enabled with an `xapp-` app token, an `xoxb-` bot token, required workspace and bot identity fields, `socket-mode` transport, and `dm` audience.
- Credential values must never appear in output or errors.
- This is a local configuration-readiness check. It must not probe provider networks or report live channel bridge/process status.

### FR-08: Configured registries

- Report normalized registry identifiers and URLs from both sources:
  - Project: `<cwd>/.ai-devkit.json` `registries`.
  - Global: `~/.ai-devkit/.ai-devkit.json` `registries`.
- Preserve project and global provenance.
- Do not clone, fetch, refresh, or inspect registry caches.

### FR-09: AI DevKit version versus npm latest

- Read the installed version from the running AI DevKit CLI package metadata.
- Query the latest published version using the npm registry equivalent of `npm view ai-devkit version`.
- Report installed version, latest version, source, and whether an update is available.
- If npm is unavailable or returns invalid data, report latest version and update availability as unknown with a warning; the rest of the status report must remain usable.
- Do not add general Node or npm version diagnostics.

### FR-10: Project configuration presence and validity

- Resolve `<cwd>/.ai-devkit.json`.
- Report file presence, JSON parse validity, recognized structure, configured version, and configured environment codes.
- Validate environment codes against AI DevKit's canonical environment definitions.
- Return concrete, safe validation errors.
- Missing or invalid project configuration must be reportable without aborting unrelated checks.

## Output Contract

### Canonical JSON

- `ai-devkit status --json` is the canonical machine-readable interface.
- The top-level object must include `generatedAt`, `overall`, `aiDevkit`, `project`, `agents`, `tmux`, `registries`, `channels`, and aggregate `checks` counts.
- `agents` must contain stable per-agent objects keyed by `codex`, `pi`, and `claude`.
- Agent-specific executable, global configuration, authentication, built-in-skill, and hook results must remain nested under that agent.
- Every leaf check and every meaningful aggregate must use `pass`, `warn`, or `fail`.
- Arrays must remain arrays when empty, and unavailable scalar values must be represented explicitly as `null` rather than omitted when their absence is meaningful.
- Findings must include safe evidence such as paths, counts, missing item names, and redacted errors where needed.

### Overall status

- `fail` means at least one required check failed.
- `warn` means no check failed and at least one check warned.
- `pass` means all evaluated checks passed.
- Aggregate counts must match the emitted leaf checks.

### Failure behavior

- Missing files, missing executables, invalid local configuration, unauthenticated agents, unavailable npm, and failed provider probes are findings, not reasons to suppress the report.
- The command may exit non-zero only when it cannot produce a structurally valid and useful report, such as an internal serialization failure.
- One failed probe must not prevent independent probes from running.

### Secret handling

- Output must never contain auth tokens, API keys, channel tokens, refresh tokens, credential file contents, session contents, or raw provider failures that may embed secrets.
- Paths and errors must be sanitized before emission.
- Human-readable output, JSON output, debug output, and thrown errors are all subject to the same no-secrets rule.

## Acceptance Criteria

- **AC-01 / FR-01:** With any combination of `codex`, `pi`, and `claude` present or absent on `PATH`, JSON reports each command independently with its resolved path or a failed missing-executable finding.
- **AC-02 / FR-02:** JSON reports presence and readability for `~/.codex`, `~/.pi`, and `~/.claude` beneath the correct agent, and missing directories do not abort the report.
- **AC-03 / FR-03:** For each agent, JSON compares the canonical built-in set against the correct global skills directory and reports counts and exact missing names without consulting a skill index or listing unrelated skills.
- **AC-04 / FR-04:** Codex script and `SessionStart` registration, Claude script and `PreToolUse` registration, and Pi tracker registration are verified independently; Codex/Pi mapping registries distinguish missing, malformed, invalid, and stale-entry states without exposing session contents.
- **AC-05 / FR-05:** Each agent reports `authenticated`, `unauthenticated`, or `unknown` from the approved evidence source, and tests prove credentials and raw auth responses cannot appear in any output.
- **AC-06 / FR-06:** tmux reports its resolved path and version when `tmux -V` succeeds, and reports an isolated failure when it is absent or unusable without requiring a running server.
- **AC-07 / FR-07:** Valid and invalid Telegram and Slack configurations produce deterministic local readiness results; malformed channel JSON and schemas are reported safely; no network or bridge liveness probe runs.
- **AC-08 / FR-08:** Project and global registries are normalized and returned with provenance without any registry cache access or network refresh.
- **AC-09 / FR-09:** Installed and latest npm versions produce a correct update flag; npm failure produces `null` latest/update values and a warning while all other checks remain present.
- **AC-10 / FR-10:** Missing, valid, malformed, and structurally invalid `.ai-devkit.json` cases produce explicit project-config findings while unrelated checks still run.
- **AC-11 / Output contract:** JSON uses stable per-agent nesting, normalized `pass`/`warn`/`fail` values, explicit empty arrays/nulls, an overall status derived from leaf checks, and matching aggregate counts.
- **AC-12 / Failure behavior:** A fixture with multiple simultaneous setup failures still returns one structurally valid report containing every independently evaluable check.
- **AC-13 / Secret handling:** Automated tests place recognizable secrets in every credential/config source and provider error path and verify none appear in JSON, human-readable, debug, or error output.
- **AC-14 / Scope guard:** Tests or review confirm the command does not enumerate live agents or historical sessions, return capacity details, inspect skill-index/cache freshness, perform live channel checks, expose task/memory/Git inventories, collect generic host diagnostics, or mutate local/external state.

## Constraints & Assumptions

### Technical constraints

- The command is read-only and must use existing constants, path definitions, parsers, setup assets, and provider probes where they are authoritative.
- Probes must be isolated so one timeout, malformed file, absent executable, or unavailable service cannot discard other results.
- File comparison for bundled hooks must be deterministic and must not execute hook code.
- Network access is limited to the npm latest-version lookup; channel readiness is local-only, and authentication probes must follow their approved read-only boundaries.
- JSON field names and status semantics form the agent-manager-facing contract and require tests.

### Assumptions

- The globally managed setup scope for this command is Codex, Pi, and Claude.
- The canonical built-in skill list remains owned by AI DevKit and is not duplicated in the status implementation.
- File presence alone does not prove authentication unless the approved provider probe establishes it.
- A session mapping registry may legitimately be absent before the corresponding agent has produced a session.
- The existing human CLI may render a concise projection of the same model, but JSON remains authoritative.

### Rollout

- Introduce `ai-devkit status` without changing existing specialized commands.
- Do not automatically invoke `status` from agent-management or orchestration skills in this requirements phase; integration changes require separate approved scope.
- Preserve existing setup behavior and files; the new command only observes them.

## Questions & Open Items

- None. The command scope, evidence boundaries, JSON status model, failure behavior, secret-handling rule, and rejected scope are approved for design.
