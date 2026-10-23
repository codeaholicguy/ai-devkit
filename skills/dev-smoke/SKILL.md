---
name: dev-smoke
description: AI DevKit · Smoke-test the user flows a change affects (CLI, API, UI) end to end with a disposable sandboxed script against the real app. Use before calling a feature or fix done, when unit tests pass but the flow is untested, or when users ask for a smoke, e2e, or impact check.
---

# Smoke

Exercise the flows a change touches the way a user would, then throw the script away. Report with `verify`; use `dev-testing` for permanent tests.

## Rules

- Drive the real entry point: built binary, running server, CLI, UI, or job. Imported functions and mocks are not smoke checks.
- Sandbox everything: temp dir, isolated `HOME` and config, empty git hooks, seeded test data, test accounts and tokens.
- Never use production, shared environments, real accounts or credentials, or paid APIs. Ask before outward-facing side effects: messages, emails, webhooks, deploys, pushes.
- Start servers on a dedicated port, wait until they respond, and stop the whole process tree on exit. Never reuse or kill the user's own servers.
- Keep secrets out of the script and its output.
- Write the script outside the repo; commit it only if the user asks to promote it.
- Timebox setup. If the app cannot run locally, say what was not checked instead of faking a pass.

## Workflow

1. Read the change: `git diff` against the base branch, plus untracked files.
2. Map impact outward: changed symbols -> callers -> entry points (commands, routes, screens, jobs, hooks, config, migrations) -> user flows. Add adjacent flows sharing the changed code, config, or data; note skipped flows and why.
3. List scenarios as setup / action / expected result, ordered by risk. Wait for the user to add or cut flows; when running unattended, proceed and include the list in the report.
4. Search memory for known setup: `npx ai-devkit@latest memory search --query "<project> smoke setup" --tags "smoke"`. Build once, then write the script from `references/smoke-template.sh` (CLI, API) or `references/web-smoke-template.mjs` (browser). Each check asserts output, files, HTTP status, or exit code, not just "it ran"; API checks also assert the body and one error case (bad input, missing auth). Print PASS/FAIL per check and exit non-zero on any failure.
5. Run it and read the full output.
6. On a failure, first rule out a wrong check (selector, timing, setup), then rerun it on the base commit in a separate worktree (`dev-worktree`) to separate regressions from pre-existing failures.
7. Report with `verify`: scenarios, command, exit code, per-check result, pre-existing failures, flows not covered.
8. Delete the script and sandbox, or offer to promote valuable checks into permanent tests or the project's release smoke suite. Store non-obvious setup: `npx ai-devkit@latest memory store --title "<project> smoke setup" --content "<start command, port, health URL, seeding, traps>" --tags "smoke"`.

## UI and Web

- Use the harness's browser tool when available (for example Claude in Chrome or a Playwright MCP server); otherwise the web template, with Playwright installed in the sandbox.
- Use a fresh browser context per check, and act like a user: navigate, click, fill forms, submit.
- Assert visible content, URL, network status, and zero console errors, not just that the page loaded. Match visible elements by role or text; hidden duplicates (mobile menus, templates) cause false failures.
- UI impact includes shared components, layouts, global styles, and every route rendering the changed component. Check narrow viewports or dark mode when layout or theming changed.
- Save a screenshot per check as evidence, and read it before judging a failure.
- Not covered: native mobile apps, desktop apps, pixel-level visual diffs. Report them as unchecked.

## Stop

Pause when impacted flows are unclear, a scenario needs anything the Rules forbid, setup needs destructive actions, or failures come from the environment rather than the change.
