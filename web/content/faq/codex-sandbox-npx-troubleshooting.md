---
title: Codex Sandbox Troubleshooting for npx ai-devkit
description: Fix common Codex sandbox permission issues when running npx ai-devkit, including npm registry access, npm cache EPERM errors, and memory database initialization.
order: 10
---

If you run `npx ai-devkit` inside Codex and hit permission or connectivity errors, this is usually a sandbox configuration issue.

For the canonical npx-only command sequence, see [Getting Started](/docs/1-getting-started). Prefix every AI DevKit command with `npx ai-devkit@latest` when you do not have a global installation.

## Why this happens

Codex runs in sandbox mode by default. That means it can be blocked from:

- Network access (for npm registry endpoints)
- Directories outside the current workspace (for example `~/.npm` and `~/.ai-devkit`)

## Issue 1: Cannot fetch package from npm registry

### Typical symptom

`npx ai-devkit` fails when trying to download a package from npm.

### Fix

Enable network access in `~/.codex/config.toml`:

If `[sandbox_workspace_write]` already exists, update that existing block instead of creating a second one.

```toml
[sandbox_workspace_write]
network_access = true
```

## Issue 2: `npm ERR! Error: EPERM` while running `npx`

### Typical symptom

You see frequent npm permission errors like:

```text
npm ERR! Error: EPERM
```

### Cause

Codex cannot access npm cache directories (commonly `~/.npm`).

### Fix

Allow writable roots for user cache/data directories:

```toml
[sandbox_workspace_write]
network_access = true
writable_roots = ["~/.npm"]
```

## Issue 3: `npx ai-devkit memory` cannot initialize local database

### Cause

The memory command needs access to `~/.ai-devkit` to initialize local database files.

### Fix

Make sure `~/.ai-devkit` is included in `writable_roots`:

```toml
writable_roots = ["~/.ai-devkit", "~/.npm"]
```

## Recommended config

Use this minimal configuration in `~/.codex/config.toml`:

```toml
[sandbox_workspace_write]
network_access = true
writable_roots = ["~/.ai-devkit", "~/.npm"]
```

## After updating config

1. Save `~/.codex/config.toml`.
2. Restart your Codex session so sandbox settings are reloaded.

If it still fails, verify you have only one `[sandbox_workspace_write]` block and confirm `writable_roots` includes all paths.
