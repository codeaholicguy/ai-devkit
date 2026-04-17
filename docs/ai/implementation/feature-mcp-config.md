---
phase: implementation
title: "MCP Config Standardization — Implementation"
description: "Technical implementation notes for MCP config generation"
---

# Implementation: MCP Config Standardization

## Development Setup

- Worktree: `.worktrees/feature-mcp-config`
- Branch: `feature-mcp-config`
- Dependencies: `npm ci` in worktree root

## Code Structure

```
packages/cli/src/
├── types.ts                          # McpTransport, McpServerDefinition, DevKitConfig.mcpServers
├── lib/
│   ├── Config.ts                     # No changes — generic update/read handles mcpServers
│   ├── InitTemplate.ts              # mcpServers validation (validateMcpServers, validateStringRecord)
│   └── SkillManager.ts              # Refactored to use shared isInteractiveTerminal()
├── commands/
│   ├── init.ts                       # Persist mcpServers from template to config
│   └── install.ts                    # Report MCP results in summary
├── services/
│   └── install/
│       ├── install.service.ts        # Call installMcpServers() with --overwrite passthrough
│       └── mcp/
│           ├── index.ts              # Re-exports: installMcpServers, McpInstallOptions, McpInstallReport
│           ├── types.ts              # McpAgentGenerator, McpMergePlan, McpInstallReport
│           ├── BaseMcpGenerator.ts   # Abstract base: shared plan() + apply() logic
│           ├── McpConfigGenerator.ts # Orchestrator: dispatch, conflict resolution, CI mode
│           ├── ClaudeCodeMcpGenerator.ts  # .mcp.json generator
│           └── CodexMcpGenerator.ts       # .codex/config.toml generator
└── util/
    ├── config.ts                     # mcpServers in InstallConfigData + Zod schema
    ├── object.ts                     # deepEqual() — shared recursive comparison
    └── terminal.ts                   # isInteractiveTerminal() — shared TTY detection
```

## Implementation Notes

### Core Features

**McpServerDefinition validation:** Manual validation in `InitTemplate.ts` matching existing patterns. Extracted to `validateMcpServers()` and `validateStringRecord()` helpers. Validates transport (`stdio`|`http`|`sse`), `command` required for stdio, `url` required for http/sse. Also validated via Zod in `util/config.ts` for the install path.

**Generator architecture:**
- `BaseMcpGenerator` — abstract base with shared `plan()` and `apply()` diff-and-merge logic
- Subclasses implement 3 abstract methods: `toAgentFormat()`, `readExistingServers()`, `writeServers()`
- `McpConfigGenerator` — orchestrator that dispatches to generators and handles conflict resolution

**Conflict resolution (interactive vs CI):**
- Interactive (TTY): `inquirer` prompt — skip all / overwrite all / choose per server
- Non-interactive: `--overwrite` → overwrite all; default → skip all (no hanging prompts)
- Detection via shared `isInteractiveTerminal()` in `util/terminal.ts`

### Patterns & Best Practices

- Abstract base class eliminates duplicated plan/apply logic between generators
- Follows existing `install.service.ts` report structure (`installed`/`skipped`/`failed` counts)
- Follows existing `InitTemplate.ts` validation patterns (manual validation, clear field-path error messages)
- `inquirer` for interactive prompts (already a dependency)
- `fullConfig` instance field in each generator preserves non-MCP content between read → write

## Integration Points

- `ConfigManager.read()` → returns `mcpServers` from `.ai-devkit.json` (no code changes needed)
- `InitTemplate.loadInitTemplate()` → validates and returns `mcpServers` from template
- `reconcileAndInstall()` → calls `installMcpServers()` after skills section, passes `{ overwrite }` from CLI
- `installCommand()` → reports MCP results in install summary

## Error Handling

- Invalid `mcpServers` in template → validation error with field path (e.g., `"mcpServers.memory.command" is required for stdio transport`)
- Existing config file parse failure → treat as empty (catch block), don't block install
- Generator failure → report as failed in `McpInstallReport`, continue with other agents
- Overall MCP failure → push to `report.warnings`, don't affect exit code for environment/phase failures
