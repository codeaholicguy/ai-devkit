---
phase: testing
title: Testing Strategy & Verification Plan
description: Define test scenarios, fixtures, mocks, and coverage targets
---

# Testing Strategy & Verification Plan

## Test Scenarios

### Provider Parser & Failure Classification (`packages/agent-manager/tests/capacity/antigravity.test.ts`)

- [x] Parses full multi-family `agy -p /usage --output-format json` fixture (Gemini Models 5h + weekly, Claude and GPT models 5h + weekly) into `CapacityWindow[]` with expected `id`, `label`, `durationMinutes`, `usedPercent`, and `resetsAt`.
- [x] Parses weekly-only Starter tier fixture without fabricating 5-hour windows.
- [x] Preserves model-specific group names (e.g., `Gemini 4 Argon`) and avoids duplicated group/cadence labels.
- [x] Parses alternative `remaining_fraction` encodings (`remaining.remaining_fraction` and oneof `{ case: "remainingFraction", value }`), clamps out-of-range fractions to `[0, 1]`, and handles numeric/string epoch-second `reset_time`.
- [x] Skips `disabled: true` buckets and rejects payloads with non-`SUCCESS` status, wrong `command.name`, missing groups, or zero enabled buckets with known quota.
- [x] Computes truthful tri-state availability (`"yes"` when any measured window `< 100%`, `"no"` when all measured windows `>= 100%`).
- [x] Parses `agy --version` strings (`1.2.11`, `agy 1.1.11`, `v1.1.10`, pre-release tags) and enforces `>= 1.1.11`.
- [x] Classifies `agy` non-zero exit stderr into sanitized errors: sign-in markers → `authentication_required`, eligibility markers → `ineligible` / `eligibility_network`, network markers → `network`, generic → `exited`, and asserts raw stderr (URLs, emails, paths) never appears in error messages.

### Source Runner, Safeguards & Version Caching (`packages/agent-manager/tests/capacity/antigravity.test.ts`)

- [x] Respects authoritative `ANTIGRAVITY_CLI_PATH` (uses it when executable; fails with `executable_not_found` when empty/missing without falling back to `PATH`).
- [x] Discovers `agy` via `PATH` and well-known paths when `ANTIGRAVITY_CLI_PATH` is unset.
- [x] Caches `agy --version` by `(path, size, mtimeMs, ino)` across calls and invalidates when stat metadata changes; does not cache failed/unknown version probes.
- [x] Rejects `agy < 1.1.11` without running `-p /usage`.
- [x] Passes `AGY_CLI_DISABLE_AUTO_UPDATE=true`, prepends private `0700` temp dir with executable `open`/`xdg-open` stubs to `PATH`, sets `BROWSER` to the stub, runs in that temp dir as `cwd`, and removes the temp dir afterward (on both success and failure).
- [x] Converts `authentication_required` failures into an unauthenticated `CapacityReport` (`authenticated: false`, `available: "unknown"`, `windows: []`) instead of throwing.
- [x] Maps timeout and output-cap overflow (`> 1 MiB`) to sanitized errors and cleans up real child processes in a subprocess safeguard test (using disposable fake shell scripts).

### Public Entrypoint & CLI Command (`packages/cli/tests/commands/capacity/command.test.ts`, `packages/agent-manager/tests/capacity/index.test.ts`)

- [x] `ai-devkit capacity` (no args) probes `"antigravity"` alongside the 6 existing providers (`Capacity · 7 providers`).
- [x] `ai-devkit capacity antigravity` and `ai-devkit capacity agy` both resolve to `"antigravity"` and render `antigravity · Antigravity` in table and `--json` formats.
- [x] Unknown provider error message includes `"antigravity"` in the supported providers list.
- [x] Multi-provider mode warns cleanly when `antigravity` fails while preserving all other provider reports; single-provider mode propagates the error.
- [x] Multiple providers are probed concurrently while preserving deterministic output order (`Promise.allSettled`).
- [x] Direct Cloud Code OAuth fast path resolves credentials from env/files, skips expired tokens, sends Hub `User-Agent`, skips `loadCodeAssist` when `projectId` is known, avoids spawning `agy` on success, and falls back to `agy -p /usage` on failure.

### Smoke Verification (`dev-smoke`)

- [x] Ran built `packages/cli/dist/cli.js` against isolated fake `agy` binaries via `ANTIGRAVITY_CLI_PATH` and isolated `HOME`:
  - `capacity agy --json` → exit 0, valid JSON, 4 windows, verified `AGY_CLI_DISABLE_AUTO_UPDATE=true` and failing `open` stub.
  - `capacity antigravity` → exit 0, rendered `antigravity · Antigravity capacity · OK` and multi-family quota rows.
  - `capacity antigravity --json` (unauthenticated) → exit 0, `authenticated: false`, `available: "unknown"`, zero stderr leak.
  - `capacity antigravity` (missing binary) → non-zero exit with `agy executable not found`.

## Verification Results

- `npx vitest run packages/agent-manager/tests/capacity/ packages/cli/tests/commands/capacity/` → 11 files, 154 tests passed (0 failed).
- `npx nx run-many -t build -p agent-manager,cli` → exit 0.
- `npm run lint` → exit 0.
- `dev-smoke` script → 4/4 checks passed, exit 0.
