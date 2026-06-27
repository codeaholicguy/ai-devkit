---
name: dev-commit
description: AI DevKit · Safe git commit workflow for AI coding agents. Use when the user asks to commit, prepare a commit, stage changes, create a PR-ready checkpoint, or finish work with a conventional commit while avoiding unrelated user changes.
---

# Dev Commit

Make one intentional, verified commit without sweeping in unrelated work.

## Commit Contract

1. Check repository state with `git status --short --branch`, `git diff --stat`, and `git diff`.
2. Identify the files that belong to the requested change. Treat pre-existing user edits, local config, generated artifacts, dependency caches, build outputs, and unrelated formatting churn as out of scope unless the user explicitly includes them.
3. Run appropriate validation before committing. Prefer the repo's targeted tests, lint, typecheck, build, or documented verification commands. Record skipped validation with the reason.
4. Stage only intended paths. Prefer explicit pathspecs such as `git add path/to/file` over `git add .`.
5. Re-check with `git diff --cached --stat`, `git diff --cached`, and `git status --short`.
6. Write a concise conventional commit message: `<type>(optional-scope): <summary>`.
7. Commit, then report the commit SHA, final status, validation commands, and any unstaged/untracked files left behind.

## Guardrails

- Do not commit secrets, credentials, `.env` files, local machine config, caches, coverage, logs, screenshots, or generated files unless the change explicitly requires them.
- Do not stage another person's unrelated edits. If intended and unrelated changes are mixed in one file, use an interactive or patch-based staging flow and review the staged diff carefully.
- Do not amend, rebase, force-push, reset, or delete branches unless the user explicitly asks for that operation.
- If validation fails, stop before committing unless the user explicitly instructs you to commit with failing validation. Report the failing command and key output.
- If the repo has commit hooks, let them run. If a hook changes files, inspect and stage only intended hook outputs before retrying.

## Message Style

Use semantic or conventional commit types that match the change:

- `feat`: user-facing feature or capability
- `fix`: bug fix
- `docs`: documentation-only change
- `test`: test-only change
- `refactor`: behavior-preserving code restructuring
- `chore`: maintenance, build, tooling, metadata, or generated index updates

Keep the subject under about 72 characters when practical, imperative, and specific. Add a body only when it explains non-obvious validation, risk, migration, or follow-up context.
