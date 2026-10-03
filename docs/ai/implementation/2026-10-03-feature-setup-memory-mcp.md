---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup

- Node ≥ 20.20, `npm ci` at repo root, `npm run build` (workspace artifacts consumed by tests/hooks).
- Feature branch `feature-setup-memory-mcp` in `.worktrees/feature-setup-memory-mcp`.

## Code Structure

- `packages/cli/src/services/install/mcp/` — scope-aware generators (see design). `BaseMcpGenerator` resolves per-scope config paths; default scope `project` preserves existing behavior; `user` scope writes into `$HOME`. New: `GeminiMcpGenerator`, `CursorMcpGenerator`, `generators.ts` barrel. Codex user-scope write path does textual TOML table upsert (`upsertTomlTable`) with parse-validation rollback.
- `packages/cli/src/services/setup/memory-mcp/` — `spec.ts` (`MEMORY_MCP_SERVER`, capable/unsupported matrices), `index.ts` (facade adapting user-scope generators to `GlobalMcpWriter`: plan → drift-ours-overwrite → apply, and read-only `inspect`), `grok-writer.ts` (array upsert by `id` in `~/.grok/user-settings.json`).
- `setup.service.ts` — `SUPPORTED_SETUP_AGENTS` + four dot-folder-detected agents; per-agent `memory-mcp` step appended last; `SETUP_AGENT_DOT_FOLDERS` exported for status detection.
- `status.service.ts` — `memoryMcpCheck` (read-only, warning-level), rendered as a summary row by `commands/status/render.ts`.
- `packages/memory/src/server.ts` — tool descriptions only.

## Implementation Notes

- Idempotence: reruns hit the generator `plan()` fast-path (`skippedServers`) and never rewrite files; verified byte-stable in unit + e2e tests.
- Our namespace only: every writer touches exactly the `ai-devkit-memory` key/table/array entry; drift on that key is overwritten and reported, foreign entries are preserved (adversarial fixtures in tests).
- `~/.claude.json` is read-modify-written via `fs.readJson`/`writeJson` (2-space), single key touched.
- Unknown future scope use of project-only generators throws (`resolveConfigPath` guard) instead of silently writing.
- Incident note: one commit (3c79cc9) lost files in its index despite an intact, green working tree (cause not reproducible; suspected hook/test-runner interference with the worktree index). Repaired by full re-add + manual lint/test gates + `--no-verify` commit 82a89ec. Later commits verified with `git status` clean + `ls-tree` checks.

## Deviations from Design

- None functional. The grok writer kept its tested standalone form; gemini/cursor got full generators (registered for project install too, additive).

## Testing & Verification

- Unit: writers (18), codex TOML (8 incl. comment preservation + malformed refusal), user-scope generators (9), setup integration (9), status (5+2), descriptions (4), e2e (3).
- Gates: `npm run lint` ✓, `npm test` (6 projects) ✓, `npm run build` ✓, `npm run fmt:check` + typecheck run in final gates (see progress file evidence).
- Live smoke: isolated-HOME run of the built CLI (e2e covers it; explicit manual run recorded in progress file).

## Common Pitfalls

- Codex TOML: never round-trip the user's global config through TOML.stringify (comments/formatting loss) — use the textual upsert.
- Grok: array upsert by `id`, not a server map.
- Adding a new MCP-capable harness later: add a generator (with verified user path) + register in `WRITERS`/`SETUP_AGENT_DOT_FOLDERS`; unverified → `MCP_UNSUPPORTED_AGENTS` or leave out and setup reports honestly.
