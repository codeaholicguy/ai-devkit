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
8. Bootstrap dependencies before any phase work (be proactive and project-specific):
   - Detect language/ecosystem first by checking lockfiles, manifest files, and common tooling configs.
   - Prefer deterministic, lockfile-based installs when available.
   - Use the project's native dependency manager, for example:
     - JavaScript/TypeScript: `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --frozen-lockfile`, or `bun install --frozen-lockfile` (based on lockfile/tooling)
     - Python: `uv sync`, `poetry install --no-interaction`, `pipenv sync`, or `pip install -r requirements.txt` (based on project files)
     - Ruby: `bundle install`
     - Rust: `cargo fetch` (or `cargo build` when fetch-only is not sufficient in context)
     - Go: `go mod download`
     - Java/Kotlin: `./gradlew dependencies` / `./gradlew build` or Maven equivalent as appropriate
   - If multiple managers are possible, choose the one clearly indicated by repository files/scripts and note your reasoning.
   - If no dependency manager is clearly detectable, continue and explicitly note what was checked and why bootstrap was skipped.
9. Do not run phase commands until setup/verification/bootstrap succeed.
