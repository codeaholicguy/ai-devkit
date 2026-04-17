---
phase: testing
title: "MCP Config Standardization — Testing"
description: "Testing strategy for MCP config generation"
---

# Testing: MCP Config Standardization

## Test Coverage Goals

- Unit test coverage: 100% of new code (statements/lines)
- 47 new tests added, 419 total passing

## Coverage Results

| File | Stmts | Branch | Lines |
|------|-------|--------|-------|
| `BaseMcpGenerator.ts` | 100% | 100% | 100% |
| `ClaudeCodeMcpGenerator.ts` | 100% | 92% | 100% |
| `CodexMcpGenerator.ts` | 100% | 92% | 100% |
| `McpConfigGenerator.ts` | 100% | 100% | 100% |
| `util/object.ts` | 82% | 68% | 100% |
| `util/terminal.ts` | — | — | — |
| `index.ts` | — | — | — |

Note: `index.ts` (re-export only) and `terminal.ts` (one-liner `process.stdin.isTTY`) are trivial — not worth mocking process globals.

## Unit Tests

### InitTemplate Validation (`src/__tests__/lib/InitTemplate.mcp.test.ts` — 16 tests)
- [x] Accepts valid mcpServers with stdio transport
- [x] Accepts valid mcpServers with http transport
- [x] Accepts valid mcpServers with sse transport
- [x] Accepts mixed stdio and http servers
- [x] Accepts stdio server without optional args and env
- [x] Accepts http server without optional headers
- [x] Rejects mcpServers with missing transport
- [x] Rejects mcpServers with invalid transport value
- [x] Rejects stdio server without command
- [x] Rejects http server without url
- [x] Rejects sse server without url
- [x] Rejects non-object mcpServers value
- [x] Rejects non-string args
- [x] Rejects non-string env values
- [x] Rejects non-string header values
- [x] Loads mcpServers from YAML template

### ClaudeCodeMcpGenerator (`src/__tests__/services/install/mcp/ClaudeCodeMcpGenerator.test.ts` — 11 tests)

**plan():**
- [x] Marks all servers as new when no existing .mcp.json
- [x] Skips servers already present with identical config
- [x] Detects conflicts when server exists with different config
- [x] Handles http transport with type field comparison
- [x] Handles malformed existing .mcp.json gracefully
- [x] Handles mixed new, skip, and conflict servers

**apply():**
- [x] Writes new servers to .mcp.json when no existing file
- [x] Preserves existing unmanaged servers
- [x] Writes resolved conflicts
- [x] Maps sse transport to type: sse

### CodexMcpGenerator (`src/__tests__/services/install/mcp/CodexMcpGenerator.test.ts` — 8 tests)

**plan():**
- [x] Marks all servers as new when no existing config.toml
- [x] Skips servers already present with identical config
- [x] Detects conflicts when server exists with different config
- [x] Handles malformed existing config.toml gracefully

**apply():**
- [x] Writes new servers to .codex/config.toml when no existing file
- [x] Preserves non-MCP sections in existing config.toml
- [x] Maps http transport to url with http_headers
- [x] Creates .codex directory if missing

### McpConfigGenerator Orchestrator (`src/__tests__/services/install/mcp/McpConfigGenerator.test.ts` — 12 tests)
- [x] Returns empty report when no servers
- [x] Skips agents not in environments list
- [x] Skips agents without MCP support (hasMcpSupport check)
- [x] Counts skipped servers in report
- [x] Prompts user for conflicts in interactive mode
- [x] Skips all conflicts in interactive mode when user chooses skip
- [x] Skips conflicts in non-interactive mode (CI) by default
- [x] Overwrites conflicts in non-interactive mode with --overwrite
- [x] Overwrites conflicts in interactive mode with --overwrite (no prompt)
- [x] Reports failed when generator throws
- [x] Handles per-server choice in interactive mode
- [x] Handles per-server choice where user skips

## Test Data

All test data is inline via `jest.mock('fs-extra')` and `jest.mock('inquirer')` — no fixture files needed. Tests mock:
- Empty/missing config files (new install)
- Existing configs with matching servers (skip path)
- Existing configs with differing servers (conflict path)
- Malformed files (graceful error handling)
- Non-MCP content preservation (Codex TOML, Claude Code JSON)
- Interactive vs non-interactive terminal (TTY mocking)
- User prompt responses (skip/overwrite/per-server)
