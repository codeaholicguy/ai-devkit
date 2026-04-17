---
phase: requirements
title: "MCP Config Standardization"
description: "Standardize MCP server configuration across AI agents (Claude Code, Codex, etc.) via a universal definition in .ai-devkit.json / YAML templates"
---

# Requirements: MCP Config Standardization

## Problem Statement

Different AI agents define MCP (Model Context Protocol) server configurations in incompatible formats and locations:

- **Claude Code**: `.mcp.json` (JSON, project-level)
- **Codex**: `.codex/config.toml` (TOML, project-level)
- Other agents have their own formats (Cursor, Windsurf, etc.)

When a team uses multiple agents or switches between them, they must manually create and maintain separate MCP config files for each agent. This is error-prone, duplicative, and violates DRY principles. There is no single source of truth for "which MCP servers does this project use?"

## Goals & Objectives

**Primary goals:**
- Define a universal MCP server configuration schema within `.ai-devkit.json` (and YAML init templates)
- Generate agent-specific MCP config files from the universal definition via `ai-devkit install`
- Support `ai-devkit init -t <template>` to include MCP servers from a template

**Secondary goals:**
- Support all current MCP transport types: `stdio`, `http` (streamable-http), and `sse` (deprecated, for backwards compatibility)
- Parse existing agent MCP configs to prevent accidental overwrites — always prompt before updating

**Non-goals:**
- Runtime MCP server management (starting/stopping servers)
- MCP protocol implementation (already handled by `@ai-devkit/memory`)
- Supporting all 11 environments in the first iteration — focus on Claude Code and Codex
- Per-environment overrides (single universal definition in v1)
- Adding generated files to `.gitignore` (left to user)

## User Stories & Use Cases

1. **As a developer using multiple AI agents**, I want to define my MCP servers once in `.ai-devkit.json` so that all my agents share the same configuration.

2. **As a team lead**, I want to include MCP server definitions in a shared YAML template (like `senior-engineer.yaml`) so that `ai-devkit init -t senior-engineer.yaml` sets up MCP configs for all team members.

3. **As a developer running `ai-devkit install`**, I want the tool to generate `.mcp.json` for Claude Code and `.codex/config.toml` for Codex from my universal config, without overwriting any custom servers I've already added to those files.

4. **As a developer with existing MCP configs**, I want `ai-devkit install` to detect conflicts and ask me before modifying my agent-specific config files.

## Success Criteria

- [ ] `mcpServers` key is accepted in `.ai-devkit.json` and YAML init templates
- [ ] `ai-devkit init -t <template>` persists `mcpServers` from template into `.ai-devkit.json`
- [ ] `ai-devkit install` generates `.mcp.json` for Claude Code from `mcpServers`
- [ ] `ai-devkit install` generates `.codex/config.toml` for Codex from `mcpServers`
- [ ] Existing agent configs are parsed and merged — user is prompted before any overwrites
- [ ] Transport types `stdio`, `http` (streamable-http), and `sse` (deprecated) are supported
- [ ] Validation errors for malformed `mcpServers` entries produce clear messages

## Constraints & Assumptions

**Technical constraints:**
- Must fit within the existing `ConfigManager` / `InitTemplate` / `install.service` architecture
- TOML generation for Codex requires a TOML serialization library (or hand-rolled for the simple structure)
- Agent-specific config formats may change upstream — generators should be isolated per-agent for easy updates

**Assumptions:**
- Claude Code `.mcp.json` schema (confirmed from docs):
  - stdio: `{ "mcpServers": { "<name>": { "command": "...", "args": [...], "env": {...} } } }`
  - http (streamable-http): `{ "mcpServers": { "<name>": { "type": "http", "url": "...", "headers": {...} } } }`
  - sse (deprecated): `{ "mcpServers": { "<name>": { "type": "sse", "url": "..." } } }`
  - Note: stdio is inferred when no `type` field; `type: "http"` for streamable-http; `type: "sse"` for legacy SSE
- Codex `.codex/config.toml` schema (confirmed from https://developers.openai.com/codex/mcp):
  - stdio: `[mcp_servers.<name>]` with `command`, `args`, `env`, `env_vars`, `cwd`
  - http (streamable-http): `[mcp_servers.<name>]` with `url`, `bearer_token_env_var`, `http_headers`, `env_http_headers`
  - Both support: `startup_timeout_sec`, `tool_timeout_sec`, `enabled`, `required`, `enabled_tools`, `disabled_tools`
- Single universal definition — no per-environment overrides in v1
- Project-level config only (not user-level `~/.claude.json` or `~/.codex/config.toml`)

## Questions & Open Items

- [x] ~~Confirm exact Codex TOML schema for MCP servers~~ — Confirmed via https://developers.openai.com/codex/mcp
- [x] ~~Confirm Claude Code `.mcp.json` schema~~ — Confirmed via https://code.claude.com/docs/en/mcp; uses `type` field for http/sse
- [x] ~~Which transports to support~~ — `stdio`, `http` (streamable-http), `sse` (deprecated but supported for backwards compat)
- [x] ~~Project-level only~~ — Yes, project-level only for v1
- [x] ~~Gitignore~~ — No, not adding generated files to .gitignore
- [ ] Should `ai-devkit install` handle removing servers deleted from `.ai-devkit.json`? (Suggest: no for v1, additive only)
- [ ] Should there be an `ai-devkit mcp add <name>` interactive command? (Suggest: defer to v2)
- [ ] Should we support Codex-specific fields (`startup_timeout_sec`, `tool_timeout_sec`, `enabled_tools`, etc.) in the universal schema? (Suggest: no for v1, only core fields: command/args/env/url/headers)
