---
name: dev-worktree
description: AI DevKit · Worktree setup and resume guidance for isolated feature work. Use when starting, resuming, switching, or verifying a feature branch/worktree for lifecycle, debugging, implementation, review, or multi-agent workflows.
---

# Dev Worktree

Set up or resume the correct workspace before feature work. Keep this skill focused on repository context, worktree isolation, and dependency bootstrap. Do not perform requirements, design, planning, implementation, testing, or review work here.

## Phase Contract

1. Propose the exact workspace plan before changing branch or worktree state.
2. Confirm the target branch/worktree with the user before switching contexts.
3. Use `feature-<name>` for branch and worktree names, where `<name>` is normalized kebab-case without the prefix.
4. Prefer a project-local worktree at `<project-root>/.worktrees/feature-<name>`.
5. Use no-worktree mode only when the user explicitly requests it.
6. Run all follow-up commands in the verified target context.

## Start Feature Workspace

Use for a new feature start.

1. Normalize feature name to kebab-case `<name>`.
2. Determine the project root, the directory containing `.git`.
3. If the user explicitly requests no worktree:
   - Continue in the current repository and branch.
   - Call out that branch/workspace isolation is reduced.
   - Skip to dependency bootstrap.
4. Otherwise use branch/worktree name `feature-<name>`.
5. Ensure `.worktrees` is listed in the project `.gitignore`; if not, add it.
6. If branch does not exist, run `git worktree add -b feature-<name> .worktrees/feature-<name>`.
7. If branch exists and the target worktree does not, run `git worktree add .worktrees/feature-<name> feature-<name>`.
8. If the target worktree already exists, reuse it after verifying it is clean enough for the requested work.
9. Verify worktree context with `git -C .worktrees/feature-<name> branch --show-current`; it must equal `feature-<name>`.
10. Return the active workdir path for the next phase.

## Resume Feature Workspace

Use when continuing an existing feature.

1. Check current branch with `git branch --show-current`.
2. Check available worktrees with `git worktree list`.
3. Prefer `<project-root>/.worktrees/feature-<name>` when it exists.
4. Otherwise use branch `feature-<name>` in the current repository.
5. Include the selected target in the plan and wait for approval before switching.
6. After approval, run future phase commands in the selected context.

## Dependency Bootstrap

After selecting the target context:

1. Detect ecosystem from lockfiles, manifests, and tooling configs.
2. Prefer deterministic lockfile-based installs.
3. Use the repository-native command:
   - JavaScript/TypeScript: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --frozen-lockfile`, or `bun install --frozen-lockfile`.
   - Python: `uv sync`, `poetry install --no-interaction`, `pipenv sync`, or `pip install -r requirements.txt`.
   - Ruby: `bundle install`.
   - Rust: `cargo fetch`, or `cargo build` when fetch-only is insufficient.
   - Go: `go mod download`.
   - Java/Kotlin: `./gradlew dependencies`, `./gradlew build`, or Maven equivalent.
4. If no dependency manager is clearly detectable, continue and state what was checked.

## Output

End with:

- Active workdir.
- Branch name.
- Whether worktree or no-worktree mode is active.
- Dependency bootstrap command run, or why it was skipped.
- Any workspace risks or blockers.
