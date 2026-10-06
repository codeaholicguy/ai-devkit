---
phase: testing
title: Testing Strategy
description: Derive test scenarios from requirements and design
---

# Testing Strategy

## Test Coverage Goals

- Every global MCP writer has unit tests for: create-new-file, upsert-into-existing, idempotence (byte-stable rerun), foreign-entry preservation, drift overwrite, malformed-file failure.
- Setup service tests cover each new agent (detect/skip, install, idempotent rerun) and pi's honest skip.
- Status check reports correct per-agent states.
- E2E: isolated `$HOME` run of the real `setup` command asserting config contents per environment.
- Coverage parity with existing setup-service tests; no coverage regression in touched packages.

## Unit Tests

### Writers (`packages/cli/src/__tests__/services/setup/memory-mcp/`)

- [ ] claude: creates `mcpServers` in `~/.claude.json` preserving all other top-level keys (incl. large state objects)
- [ ] claude: rerun byte-stable; drift overwrite restores canonical entry
- [ ] codex: appends `[mcp_servers.ai-devkit-memory]` to existing TOML with comments; comments preserved verbatim
- [ ] codex: replaces existing block; output parses (smol-toml) to expected structure
- [ ] gemini/cursor: standard JSON mcpServers upsert + idempotence + foreign servers preserved
- [ ] opencode: `mcp` key, `type:"local"`, `command` array, `enabled:true`; XDG dir creation
- [ ] grok: array upsert by `id` (append when missing, replace in place when present), other array entries untouched, `label`/`transport`/`enabled` set
- [ ] malformed JSON/TOML input → precise error (step `failed`), file left untouched

### Setup service

- [ ] gemini/cursor/opencode/grok dot-folder present → `memory-mcp` step installed with correct config
- [ ] dot-folder absent → `skipped: ~/.<folder> does not exist`
- [ ] rerun → all `memory-mcp` steps `skipped`, files byte-stable
- [ ] pi → `skipped` with "no MCP support" reason; no config written
- [ ] codex/claude keep existing steps and gain `memory-mcp` last
- [ ] one agent failing does not abort other agents (existing loop behavior)

### Status

- [ ] wired/unwired/unsupported states per agent; read-only (no file writes)

### Memory server descriptions

- [ ] TOOLS export contains behavioral instructions (search-before-task language, example query); names/schemas unchanged

## Integration Tests

- [ ] `--agent` parsing accepts new names, rejects unknown with the full supported list
- [ ] setup report table renders new steps (command-level test where pattern exists)

## End-to-End Tests

- [ ] Scripted isolated-HOME run: create `~/.codex ~/.pi ~/.claude ~/.gemini ~/.cursor ~/.config/opencode ~/.grok`, run built CLI `setup`, assert each config file contains the canonical entry; run again, assert byte-stability and all-skip; run `status`, assert memory-MCP section matches wiring.

## Test Data

- Fixture files: `~/.claude.json` with foreign state, TOML with comments/other tables, opencode.json with `$schema`, grok user-settings with apiKey + existing server array.

## Test Reporting & Coverage

- `npm test` (vitest) per package; scoped runs during development; coverage via `npm run test:coverage` in cli package if configured.

## Manual Testing

- Live smoke on THIS machine in an isolated HOME (`HOME=$(mktemp -d)` never touching real env configs) — repeated in Implementation/Verification phases.

## Performance Testing

- Not applicable (config-only writes, no loops beyond 7 agents).

## Bug Tracking

- Findings filed as GitHub issues or fixed within the branch; blockers recorded in the progress file.
