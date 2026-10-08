---
phase: design
title: harness-gemini design
description: Module layout and parity notes for the gemini port
---

# I4: harness-gemini design

## Layout

- `gemini/mod.rs` — `GeminiAdapter`: executable token scan, node-pool +
  canHandle + pid-dedupe, wrapper set, registry-cache stage, locator +
  greedy match, wrapper-name override, unmatched → process-only,
  deduplicate.
- `gemini/locator.rs` — `GeminiSessionLocator::discover_sessions`:
  candidate roots (cwd ancestors) → `cwdByHash`(sha256→first cwd) +
  normalized roots; per `<shortId>` dir gating (64-hex → hash lookup,
  else `.project_root` marker → root set, absent marker → scan); mtime
  window; 8KiB metadata head; `SessionFile` with `resolvedCwd` for the
  shared greedy matcher.
- `gemini/parser.rs` — `parse_session` (stat + full read), `.jsonl`
  `replay_session_log` (insertion-ordered message map, `$set`/`$rewindTo`),
  `.json` document, `build_session` (sessionId gate, lastActive chain,
  directories[0], last user summary), `determine_status`.
- `shared.rs` — `is_same_terminal_process`, `find_wrapper_pid`,
  `wrapper_pids`, `RegistryRow` + `registry_agent_rows` (started_at/name
  order, pid-map last-wins).
- `devkit-core/discover.rs` — `RUNTIME_BINARIES = [node, bun]` swept
  alongside `AGENT_BINARIES` (+missing kiro/agy names); `is_runtime_command`.
- `devkitd/server.rs` — `apply_sweep`: candidates = any-adapter
  `can_handle`; visible pool = dedicated binaries ∪ claimed runtime procs;
  enrich+events/store run on the visible pool.

## Parity notes

- The node pool filter lives INSIDE detect (`findHarnessProcesses`
  re-filters the slice), so `gemini`-argv0 procs are dropped in both impls.
- Greedy-match output ordering sorts by `|start−birthtime|` — file
  birthtimes are materialization-time on replay, so each bundle gets
  exactly one locator match; multi-match ordering is exercised via
  `match_processes_to_sessions` unit coverage instead.
- `.project_root` markers must be captured (`.gemini/tmp` index-style):
  a marker that names a non-candidate root gates the dir out entirely.
- Log replay upserts keep insertion order (JS Map semantics) — Vec order
  list + HashMap, not BTreeMap.
- Registry name override applies only via the WRAPPER's row; cached
  agents keep their generated name (matches `mapSessionToAgent`).
