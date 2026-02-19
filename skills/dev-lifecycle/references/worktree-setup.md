# Shared Reference: Worktree Setup

Use this setup for **new feature starts** unless the user explicitly requests no worktree (for example, `--no-worktree`).

1. Normalize feature name to kebab-case `<name>` (without prefix).
2. If user explicitly requests no worktree (`--no-worktree`):
   - Continue in the current repository and branch.
   - Call out that branch/workspace isolation is reduced.
   - Skip to step 7 (dependency bootstrap).
3. Otherwise (default), use branch/worktree name `feature-<name>`.
4. Create worktree directory as sibling path `../feature-<name>`.
5. If branch does not exist: `git worktree add -b feature-<name> ../feature-<name>`.
6. If branch exists: `git worktree add ../feature-<name> feature-<name>`.
7. If using worktree, switch and verify context before any other step:
   - `cd ../feature-<name>`
   - `pwd` must end with `/feature-<name>`
   - `git branch --show-current` must equal `feature-<name>`
8. Bootstrap dependencies before any phase work:
   - If `package-lock.json` exists: `npm ci`
   - Else if `pnpm-lock.yaml` exists: `pnpm install --frozen-lockfile`
   - Else if `yarn.lock` exists: `yarn install --frozen-lockfile`
   - Else: continue and note that no lockfile-based install step was detected
9. Do not run phase commands until setup/verification/bootstrap succeed.
