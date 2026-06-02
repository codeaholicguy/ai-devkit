# AI DevKit CLI Development

## Runtime Layout

The CLI entrypoint is optimized for startup time:

- `src/cli.ts` handles `--version` inline before loading runtime code.
- `src/cli-command-manifest.ts` is the lightweight source of truth for top-level command names, descriptions, help metadata, and lazy module paths.
- `src/cli-runtime.ts` renders static root/top-level help from the manifest and lazy-loads Commander plus the selected command module only for real command execution.
- `src/commands/` contains the command implementations.

## Adding a Top-Level Command

1. Add the command implementation in `src/commands/`.
2. Add one entry to `src/cli-command-manifest.ts`.
3. Add the lazy import/registration branch in `src/cli-runtime.ts`.
4. Update `src/__tests__/util/cli-runtime.test.ts` if the command needs new runtime coverage.

## Startup Benchmark

Run the startup benchmark after CLI runtime changes:

```bash
npm run build
npm run benchmark:startup -w packages/cli
```

The CI gate enforces p50 `<50 ms` for `--version`, root `--help`, and every top-level command `--help`.
