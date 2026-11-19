# Planning — cross-vendor agent recipe doc

## Goal

Add a short workflows doc that demonstrates: one vendor’s lead agent starting and messaging another vendor’s workers via `ai-devkit agent start`, `list`, `send`, `wait`, and `kill`.

## Scope

- New page: `web/content/docs/20-cross-vendor-agent-recipe.md`
- README one-line link; cross-link from doc 17
- No CLI or product code changes

## Verification

- Built CLI (`packages/cli/dist/bundle/cli.js`): `agent start --help`, `list --json`, `send`/`wait --help`, invalid name, start codex without binary (expected failure)
- Web site build after `web/` install
- `npm run fmt:check` and lint

## VM limits

No `claude` / `codex` binaries on the cloud VM — full cross-vendor tmux run not executed here.