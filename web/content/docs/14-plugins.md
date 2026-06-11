---
title: Plugins
description: Install global AI DevKit plugins from npm and author packages that add CLI commands.
slug: plugins
order: 14
---

AI DevKit plugins are npm packages that add commands to the `ai-devkit` CLI.

Use plugins for capabilities that should live outside the core CLI, such as dashboards, visual tools, project-specific command sets, or heavier integrations. The first plugin system supports global npm plugins only.

> **Important:** Installing a plugin means installing and running npm package code on your machine. Install plugins only from sources you trust.

## How Plugins Work

AI DevKit keeps plugins in a dedicated npm workspace under your home directory:

```text
~/.ai-devkit/npm
└── node_modules/
    └── <plugin-package>/
```

Enabled plugins are listed in the global AI DevKit config:

```json
{
  "plugins": ["@ai-devkit/memory-dashboard"]
}
```

On startup, AI DevKit:

1. Reads `~/.ai-devkit/.ai-devkit.json`.
2. Loads each package listed in `plugins`.
3. Reads the package's `package.json` plugin manifest.
4. Validates the contributed command names and JavaScript entrypoints.
5. Registers the plugin commands with the CLI.

Because plugins live under `~/.ai-devkit/npm`, they work the same way whether you run AI DevKit with `npx ai-devkit`, a globally installed `ai-devkit`, or a local binary.

## Install a Plugin

Use `ai-devkit plugin add` with an npm package name:

```bash
ai-devkit plugin add @ai-devkit/memory-dashboard
```

The command:

1. Creates `~/.ai-devkit/npm/package.json` if needed.
2. Runs `npm install <package>` inside `~/.ai-devkit/npm`.
3. Validates the plugin manifest.
4. Adds the package name to `~/.ai-devkit/.ai-devkit.json`.

If the package installs but does not contain a valid plugin manifest, AI DevKit uninstalls it and does not add it to the global config.

Only npm package names are supported in this version. Local paths, tarballs, git URLs, and version specs are not accepted by `plugin add`.

## Run a Plugin Command

After installation, run the command contributed by the plugin:

```bash
ai-devkit memory-dashboard
```

Use the plugin package documentation to know which command names and flags it provides.

## List Plugins

```bash
ai-devkit plugin list
```

The list shows each configured package and whether its manifest is valid.

## Remove a Plugin

```bash
ai-devkit plugin remove @ai-devkit/memory-dashboard
```

This uninstalls the package from `~/.ai-devkit/npm` and removes the package name from `~/.ai-devkit/.ai-devkit.json`.

## Plugin Manifest

A plugin package declares commands in its `package.json` with `aiDevkit.commands`:

```json
{
  "name": "@ai-devkit/memory-dashboard",
  "version": "0.1.0",
  "type": "module",
  "aiDevkit": {
    "commands": [
      {
        "name": "memory-dashboard",
        "description": "Open the AI DevKit memory dashboard",
        "entry": "./dist/command.js"
      }
    ]
  }
}
```

Each command has:

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | CLI command name contributed by the plugin. Use lowercase letters, numbers, and hyphens. It must start with a letter. |
| `description` | No | Short help text shown by the CLI. |
| `entry` | Yes | Path to a built JavaScript file inside the package. Supported extensions are `.js`, `.mjs`, and `.cjs`. |

Command names cannot conflict with built-in AI DevKit commands such as `memory`, `skill`, `agent`, `docs`, or `plugin`.

Command entries must point inside the plugin package. AI DevKit rejects entries that resolve outside the package root or point to missing files.

## Command Entrypoint

Each command entrypoint exports a `register` function:

```js
export async function register(command, runtime) {
  command
    .description('Open the AI DevKit memory dashboard')
    .option('--port <port>', 'Port to bind')
    .action(async options => {
      const memoryDbPath = await runtime.getMemoryDbPath();
      runtime.logger.info(`Starting dashboard for ${memoryDbPath}`);
    });
}
```

The `command` argument is a Commander command instance for the command declared in the manifest. Add options, arguments, and an action inside `register`.

The `runtime` argument gives the plugin access to stable AI DevKit context:

| Runtime field | Description |
|---------------|-------------|
| `cwd` | Current working directory where the user ran `ai-devkit`. |
| `homeDir` | User home directory. |
| `configPath` | Path to `~/.ai-devkit/.ai-devkit.json`. |
| `getConfig()` | Reads the global AI DevKit config. |
| `getMemoryDbPath()` | Returns global config `memory.path`, or `~/.ai-devkit/memory.db` when not configured. |
| `logger.info()` | Print an informational message using AI DevKit output formatting. |
| `logger.warn()` | Print a warning message using AI DevKit output formatting. |
| `logger.error()` | Print an error message using AI DevKit output formatting. |

## Develop a Plugin

Create a normal npm package and point the manifest to built JavaScript:

```text
my-plugin/
├── package.json
├── src/
│   └── command.ts
└── dist/
    └── command.js
```

TypeScript is fine for development, but AI DevKit loads JavaScript at runtime. Build the plugin before publishing and set `aiDevkit.commands[].entry` to the compiled file.

Minimal package example:

```json
{
  "name": "@my-org/hello-ai-devkit",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": "./dist/command.js"
  },
  "aiDevkit": {
    "commands": [
      {
        "name": "hello-devkit",
        "description": "Print a test message",
        "entry": "./dist/command.js"
      }
    ]
  }
}
```

Minimal command:

```js
export function register(command, runtime) {
  command.action(() => {
    runtime.logger.info(`Hello from ${runtime.cwd}`);
  });
}
```

## Local Smoke Test

Until local plugin development commands are available, you can manually create a test package under the managed plugin directory:

```bash
mkdir -p ~/.ai-devkit/npm/node_modules/@my-org/hello-ai-devkit
```

Create `~/.ai-devkit/npm/node_modules/@my-org/hello-ai-devkit/package.json`:

```json
{
  "name": "@my-org/hello-ai-devkit",
  "version": "0.0.0",
  "type": "module",
  "aiDevkit": {
    "commands": [
      {
        "name": "hello-devkit",
        "description": "Print a test message",
        "entry": "./command.js"
      }
    ]
  }
}
```

Create `~/.ai-devkit/npm/node_modules/@my-org/hello-ai-devkit/command.js`:

```js
export function register(command, runtime) {
  command.action(async () => {
    console.log('hello from an AI DevKit plugin');
    console.log(`memory db: ${await runtime.getMemoryDbPath()}`);
  });
}
```

Then add the plugin package name to `~/.ai-devkit/.ai-devkit.json`:

```json
{
  "plugins": ["@my-org/hello-ai-devkit"]
}
```

Run the command:

```bash
ai-devkit hello-devkit
```

This manual flow is only for quick local testing. Published plugins should be installed with `ai-devkit plugin add`.

## Troubleshooting

### `No global plugins configured.`

No package names are listed in `~/.ai-devkit/.ai-devkit.json`.

Install a plugin:

```bash
ai-devkit plugin add <npm-package>
```

### Plugin install succeeds, then rolls back

AI DevKit uninstalls a package after install if validation fails. Common causes:

- Missing `aiDevkit.commands` in `package.json`
- Empty command list
- Command name conflicts with a built-in command
- Command name contains spaces, arguments, options, uppercase letters, or punctuation
- Entry path points to TypeScript source instead of built JavaScript
- Entry path points outside the package root
- Entry file does not exist

### Plugin command does not appear

Run:

```bash
ai-devkit plugin list
```

If the plugin is invalid, fix the package manifest or remove and reinstall the package.

### `register()` is missing

The command entrypoint must export `register`. For ESM packages:

```js
export function register(command, runtime) {
  command.action(() => {
    runtime.logger.info('plugin command ran');
  });
}
```

## Related Pages

- [Configuration File](/docs/11-configuration-file) — global config and the `plugins` field
- [Memory](/docs/6-memory) — memory database path used by `runtime.getMemoryDbPath()`
- [Skills](/docs/7-skills) — agent skills, which are separate from CLI plugins
