---
name: dev-pr
description: AI DevKit · Publish a ready feature branch for review. Use when the user wants to sync, push, and open or update a code review request on GitHub, GitLab, or another Git host.
---

# Dev PR

Publish an already-reviewed branch for code review. Keep this separate from commit creation: if the branch has uncommitted changes, stop and ask the user to run the commit workflow first.

## Contract

1. Verify repository context with `git status -sb`, `git branch --show-current`, and `git remote -v`.
2. Confirm the branch is not the base branch and has committed changes to publish.
3. Fetch the remote before comparing or rebasing.
4. Rebase the feature branch onto the latest remote base branch before push/review.
5. Resolve conflicts carefully, preserving intended behavior, then rerun relevant validation.
6. Push safely. Use `--force-with-lease` only when a rebase rewrote an already-pushed branch.
7. Open or update the host's review request: PR, merge request, or equivalent.
8. Report review URL, branch, HEAD SHA, validation results, push mode, and risks.

## Publish Workflow

1. Inspect local context:
   - `git status -sb`
   - `git branch --show-current`
   - `git remote -v`
2. If uncommitted changes exist, stop. Do not stage, amend, squash, or commit in this skill.
3. Identify the remote and base branch from repo conventions, upstream config, or user instruction; default to `origin/main` only when that matches the repo.
4. Fetch the remote, inspect the delta, and rebase onto the remote base branch.
5. If conflicts occur, inspect conflicted files and `git diff`, resolve minimally, validate when useful, `git add`, then continue the rebase. Stop if the correct resolution is unclear.
6. Run relevant validation for the changed surface.
7. Push:
   - First push: set upstream.
   - Normal update: plain push.
   - Rebased already-pushed branch: `--force-with-lease`.
8. Open or update the review request using the host's tool/API/UI (`gh`, `glab`, forge CLI, web UI, or project-specific workflow).
9. Write a concise review description. Include enough for reviewers to understand:
   - Summary: what changed, why, and how.
   - Validation: how it was verified.
   - Risks: notable risks or "none known".
10. Report:
   - Review URL and state
   - Branch and HEAD SHA
   - Validation commands and exit codes
   - Push mode, including whether `--force-with-lease` was used
   - Risks, follow-ups, or blockers
