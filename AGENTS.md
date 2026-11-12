# AGENTS.md — ai-devkit repository conventions

Essential rules for AI agents working in this repository.

## Test placement (mandatory)

- **Unit and integration tests** always live in `packages/<pkg>/tests/` —
  never inside `src/`. The build input is `src/` only; nothing test-related
  may compile into `dist/` or ship in a published tarball.
- **E2E tests** always live in the repository-root `e2e/` folder
  (`*.e2e.ts`), with their own `e2e/vitest.config.ts`. Run them with
  `npx vitest run --config e2e/vitest.config.ts`. Never mix E2E tests into
  package test folders — the default per-package `vitest run` must stay a
  unit/integration run.

## Published packages

- Each publishable package uses a `files` allowlist; the published artifact
  contains runtime code, declarations, and source maps (intentionally
  shipped for debuggable stack traces) — but never compiled tests.
- CI enforces this: the `Package Hygiene` job packs every package and fails
  if any `__tests__` entry appears in a tarball, then installs the packed
  CLI and smokes it.
- Versions are exact-pinned across workspace dependencies; bump them
  together (`cli` pins the other packages exactly).

## Build

- `swc src -d dist` compiles only `src/`; dependency packages must be built
  before running a package's tests in a fresh worktree
  (`npm run build` at the root, or `npx nx run-many -t test`).
