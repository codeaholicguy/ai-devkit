---
phase: requirements
title: Requirements & Problem Understanding
description: Clarify the problem space, gather requirements, and define success criteria
---

# Requirements & Problem Understanding

Reference issue: [#471 — feat(capacity): integrate Antigravity (agy) subscription quota tracking](https://github.com/codeaholicguy/ai-devkit/issues/471).

## Problem Statement

**What problem are we solving?**

- Users signed in to the Antigravity (`agy`) CLI have no Antigravity subscription quota visibility in `ai-devkit capacity`. The current default report covers `codex`, `zai`, `openai`, `anthropic`, `claude`, and `devin`, leaving Antigravity quota invisible to capacity checks and multi-agent dispatch.
- Affected users: developers running `agy` sessions alongside other AI harnesses who rely on `ai-devkit capacity` (human table or `--json`) to check remaining quota before starting work.

**Verified technical facts (from CodexBar reference `docs/antigravity.md` and `Sources/CodexBarCore/Providers/Antigravity/`):**

1. Modern `agy` CLI (`>= 1.2.2`) gates its local HTTPS server behind an unexposed CSRF token (`401 missing CSRF token`), so non-interactive usage reporting is the reliable primary path (introduced in `agy` `1.1.11`):
   ```sh
   agy -p /usage --output-format json --print-timeout 90s
   ```
2. `agy --version` must verify `>= 1.1.11` before running print mode, and version checks can be cached in-process by binary path, size, mtime, and inode.
3. Every `agy` child process must receive `AGY_CLI_DISABLE_AUTO_UPDATE=true` (lowercase literal `true`; `1` is ignored) to prevent passive probes from triggering auto-updates.
4. When silent sign-in fails, `agy` print mode may invoke `open` or `xdg-open` from `PATH` or `BROWSER` to launch Google OAuth in a browser. Probes must run in a private `0700` temp directory with failing `open`/`xdg-open` stubs prepended to `PATH` and `BROWSER` pointing to the stub, bounded timeout (`90s` default) and output cap (`1 MiB`), and process-group cleanup on completion or timeout.
5. The JSON report uses snake_case keys with `status == "SUCCESS"`, `command.name == "usage"`, and `command.data.groups[].buckets[]`, where each bucket provides `id`/`bucket_id`, `name`/`display_name`, `remaining_fraction` (or nested `remaining.remaining_fraction` / oneof), `reset_time` (ISO-8601 or epoch seconds), `window` cadence (`5h`, `weekly`, etc.), and `disabled`.
6. Antigravity exposes model families (typically **Gemini Models** and **Claude and GPT models**, plus optional model-specific groups) with 5-hour and weekly buckets; Starter tiers may expose weekly-only buckets (never fabricate absent 5-hour windows).
7. Raw `stderr` from `agy` may contain account-identifying URLs, proxy info, or local paths and must never be surfaced directly to users; failures must be mapped to fixed sanitized diagnostics.

## Goals & Objectives

**Primary goals:**
- Add Antigravity (`agy`) capacity probing to `@ai-devkit/agent-manager` (`getAntigravityCapacityReport`) and wire it into `ai-devkit capacity`.
- Support both `ai-devkit capacity antigravity` and `ai-devkit capacity agy` (alias) in table and `--json` modes.
- Include `antigravity` in the default `ai-devkit capacity` multi-provider run with graceful degradation when `agy` is not installed, below `1.1.11`, or fails.
- Enforce all process, environment, output-cap, and browser-suppression safeguards on every `agy` probe.

**Secondary goals:**
- Support `ANTIGRAVITY_CLI_PATH` as an authoritative binary override (matching CodexBar semantics: if set, do not fall back to `PATH` discovery).
- Use the direct Google Cloud Code OAuth API (`loadCodeAssist` → `retrieveUserQuotaSummary`) as a fast path when local OAuth credentials are available (`ANTIGRAVITY_ACCESS_TOKEN`, `ANTIGRAVITY_OAUTH_CREDENTIALS_JSON`, `~/.gemini/antigravity-cli/antigravity-oauth-token`, or `~/.codexbar/antigravity/oauth_creds.json`), falling back cleanly to `agy -p /usage`.
- Probe multiple capacity providers concurrently in `ai-devkit capacity` while preserving deterministic output order.
- Preserve truthful tri-state capacity semantics (`authenticated: true | false | null`, `available: "yes" | "no" | "unknown"`).

**Non-goals (explicitly deferred to keep v1 focused and low-risk):**
- Legacy `agy` (`< 1.2.2`) / `Antigravity.app` local HTTPS Connect/gRPC-Web probing.
- Multi-account macOS staged-`HOME` / `SSH_TTY` token switching.
- Interactive OAuth sign-in flows or modifying any `agy` user config/Keychain state.
- Live network or real-account calls in unit/integration tests.

## User Stories & Use Cases

- As a developer with `agy >= 1.1.11` signed in, running `ai-devkit capacity antigravity` or `ai-devkit capacity agy` shows `antigravity · Antigravity` with each enabled model-family quota window (e.g., `Gemini Models · 5h`, `Gemini Models · Weekly`, `Claude and GPT models · 5h`, `Claude and GPT models · Weekly`), usage bars, percentages, and reset times.
- As a developer running `ai-devkit capacity` with no arguments, Antigravity is included alongside other providers; if `agy` is not installed or too old, a clear `antigravity capacity unavailable: ...` warning is shown and all other providers still render normally.
- As a developer whose `agy` session is signed out, `ai-devkit capacity antigravity` returns `authenticated: false`, `available: "unknown"`, `windows: []` (rendering `NOT AUTHENTICATED`) without opening a browser tab or leaking raw stderr.
- As a Starter-tier user with weekly-only buckets, only the reported weekly windows appear; no 5-hour windows are fabricated.

**Edge cases:**
- `ANTIGRAVITY_CLI_PATH` set to empty/missing/non-executable path → fail clearly without falling back to `PATH`.
- `agy` binary missing on `PATH` and well-known locations (`~/.local/bin/agy`, `/opt/homebrew/bin/agy`, `/usr/local/bin/agy`) → clear `"agy executable not found"` error.
- `agy --version` `< 1.1.11` or unparseable → clear `"agy CLI >= 1.1.11 is required"` error without launching print mode.
- Disabled buckets (`disabled: true`) → omitted from reported windows; if no enabled buckets with known quota remain → parse error.
- `remaining_fraction` out of `[0, 1]` → clamped before computing `usedPercent`.
- `reset_time` as ISO-8601 string or numeric/string epoch seconds → normalized to ISO-8601 `resetsAt`; invalid/missing → `null`.
- All measured enabled buckets at `100%` used → `available: "no"`; any measured enabled bucket `< 100%` → `available: "yes"`; no measured fractions → `available: "unknown"`.
- Subprocess timeout or stdout exceeding `1 MiB` → process group reaped, temp dir removed, clear sanitized error returned.
- Raw `stderr` containing emails, URLs, or file paths → never included in thrown error messages or reports.

## Success Criteria

- `ai-devkit capacity antigravity` and `ai-devkit capacity agy` work in both human-readable table and `--json` formats.
- Default `ai-devkit capacity` includes `antigravity` without regressing existing providers (`codex`, `zai`, `openai`, `anthropic`, `claude`, `devin`).
- All safeguards (`AGY_CLI_DISABLE_AUTO_UPDATE=true`, `0700` temp cwd, failing `open`/`xdg-open` stubs + `BROWSER`, `90s` timeout, `1 MiB` output cap, process-group cleanup, sanitized stderr) are implemented and unit-tested.
- Unit, integration, CLI, and smoke tests pass with fresh command output; `npm run build` and `npm run lint` pass.

## Constraints & Assumptions

- Zero new runtime npm dependencies; use Node built-ins (`node:child_process`, `node:fs/promises`, `node:os`, `node:path`).
- Follow `AGENTS.md`: unit/integration tests live in `packages/<pkg>/tests/`, never inside `src/`.
- Follow existing capacity architecture (`packages/agent-manager/src/capacity/providers/` for pure parsing & classification, `packages/agent-manager/src/capacity/sources/` for subprocess probing, `packages/agent-manager/src/capacity/index.ts` for public entrypoint).
- Assume `agy -p /usage --output-format json` returns snake_case JSON matching the documented schema (while tolerating camelCase equivalents defensively in the parser).

## Questions & Open Items

1. **MVP scope**: Combine a direct Cloud Code OAuth fast path (when a non-expired local/env OAuth token is present) with modern `agy` CLI print mode (`>= 1.1.11`) as the universal fallback. Legacy local HTTPS and macOS multi-account staged-HOME remain deferred to future issues if needed.
2. **Provider identity & CLI alias**: Use `harness: "antigravity"`, `provider: "antigravity"`, display label `"Antigravity"`, and accept `"agy"` as a CLI alias alongside `"antigravity"` (mirroring `"z.ai"` -> `"zai"`).
3. **Auth failure handling**: Return `{ authenticated: false, available: "unknown", windows: [], creditsRemaining: null }` when `agy` stderr indicates sign-in/authentication is required (matching `devin` and `anthropic` precedent), rather than throwing.

No unresolved items remain.
