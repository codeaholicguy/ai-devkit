# Contributing to AI DevKit

Thanks for wanting to help. This repo is an Nx monorepo in TypeScript, with a Rust daemon (`devkitd`) under `rust/`. The license is Apache-2.0.

## Setup

You need **Node.js 22 or newer**. `package.json` sets `engines.node` to `>=22.0.0`. `.nvmrc` pins `24.22.3`.

```bash
git clone https://github.com/codeaholicguy/ai-devkit.git
cd ai-devkit
npm install
npm run build
```

The control plane (`agent list`, `agent send`, managed `agent start`, and the console) expects **tmux** on macOS or Linux. The console is experimental and is not supported on Windows.

For Rust work, a stable toolchain with `rustfmt` and `clippy` is enough (`rust/rust-toolchain.toml`).

## Checks

Run these from the repo root before you open a PR:

```bash
npm run build
npm run lint
npm run fmt:check
npm test
```

End-to-end tests (they use the compiled CLI):

```bash
npm run test:e2e
```

That is `vitest run --config e2e/vitest.config.ts`. Some e2e cases start the real `devkitd` binary, so the Rust toolchain has to be available.

If you touch Rust:

```bash
cd rust
cargo test --workspace
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```

`npm run fmt` formats the TypeScript packages (`oxfmt`) and the Rust workspace. Husky runs on commit; the pre-commit hook runs `fmt:check`, `lint`, and `test`. If a hook is too heavy in a constrained sandbox, say so in the PR rather than skipping checks silently.

## Where tests go

- Unit and integration tests live in `packages/<pkg>/tests/`, never under `src/`. Package `vitest run` must stay a unit/integration run, and tests must not ship in the published tarball.
- E2E tests live in the repo-root `e2e/` folder as `*.e2e.ts`.

## What makes a good PR

- Keep the change focused. A one-line registry addition and a new harness adapter should not share a PR.
- Add or update tests for the behavior you changed.
- If you add a feature, follow the existing `docs/ai/` requirement / design / planning / implementation / testing docs when the change is substantial.
- Update `CHANGELOG.md` under `## Unreleased` when the change is user-visible. If `main` already has that heading, put your bullet under the heading from `main` and rebase. If it is missing on your branch, add `## Unreleased` at the top (below the intro) per the repo changelog skill.

### Adding a skill registry

Default registries live in `skills/registry.json`. The source repo should use the `skills/<name>/SKILL.md` layout on the default branch. This is usually a one-line change. Please mention any affiliation with the registry in the PR body.

Users can already add a registry themselves with `ai-devkit skill add-registry` without a PR. A default-registry PR is for catalogs you think most users should be able to `skill find` out of the box.

### Adding or changing a harness

Harness work usually needs TypeScript and Rust parity (discovery, session mapping, start/send), tests on both sides, and a short update to the agent docs under `web/content/docs/`. Look at an existing adapter (Pi is a common reference) and at PR discussions for recent harness additions.

## Issues and questions

- Bugs and feature requests: open an issue. The templates ask for a repro and environment details; those save a lot of back-and-forth.
- Questions that are not bugs are welcome too. If Discussions is a better fit, use that.
- Please don't bump an issue just to get a response. If something is waiting, that's on me, not you.

If you are stuck, say so on the issue or PR. A short, specific question is easier to answer than a stalled thread.