---
name: dev-smoke
description: AI DevKit · Map the user-facing flows a code change can affect, then build and run a disposable end-to-end smoke script against the real app in a sandbox, including browser flows for UI and web changes. Use before calling a feature or fix done, when unit tests pass but the flow is untested, after cross-cutting changes, or when users ask for a smoke test, e2e check, impact check, or "does the whole flow still work".
---

# Smoke

Exercise the flows a change touches the way a user would, then throw the script away. Use `verify` to report the result and `dev-testing` for permanent tests.

## Rules

- Drive the real entry point: built binary, running server, CLI, UI, or job. Imported functions and mocks are not smoke checks.
- Run in a sandbox: temp dir, isolated `HOME` and config, empty git hooks, throwaway data. Never touch real user state.
- Never hit production, shared environments, real credentials, or paid APIs. Ask before any outward-facing side effect: messages, emails, webhooks, deploys, pushes.
- Start servers on a dedicated port, wait until they respond, and stop the whole process tree on exit. Never reuse or kill the user's own running servers.
- Keep secrets out of the script and its output. Read them from env vars only when the user provides them.
- Write the script outside the repo (scratchpad or temp dir). Never commit it unless the user asks to promote it.
- Timebox setup. If the app cannot run locally, say so and list what was not checked instead of faking a pass.

## Workflow

1. Read the change: `git diff` against the base branch, plus untracked files.
2. Map impact outward: changed symbols -> callers -> entry points (commands, routes, screens, jobs, hooks, config loading, migrations) -> user flows.
3. Add adjacent flows that share the changed code, config, or data, not only the requested feature. Note flows deliberately skipped and why.
4. List scenarios as setup / action / expected result, ordered by risk. Show the list and wait for the user to add or cut flows before writing the script.
5. Find how the project builds and starts; build once before the script runs.
6. Write the script in the project's shell or scripting language, following `references/smoke-template.sh` (or `references/web-smoke-template.mjs` for browser flows, see UI and Web):
   - sandbox setup with cleanup on exit
   - one `run_check` per scenario that logs the command, exit code, and key output
   - assertions on output, files, HTTP status, or exit code, not just "it ran"
   - for APIs: status, response body or shape, and at least one error case (bad input, missing auth) using test tokens
   - summary of PASS/FAIL per check and a non-zero exit on any failure
7. Run it. Read the full output.
8. If a check fails, rerun that check on the base commit in a separate worktree to tell a regression from a pre-existing failure.
9. Report through `verify`: scenarios, command, exit code, pass/fail per check, pre-existing failures, and flows not covered.
10. Delete the script and sandbox, or offer to promote valuable checks into a permanent test or the project's release smoke suite.

## UI and Web

- Drive a real browser. Use the harness's browser tool when available (for example Claude in Chrome or a Playwright MCP server); otherwise use `references/web-smoke-template.mjs` with Playwright installed in the sandbox, never in the project.
- Use a fresh browser context per check: no saved logins, cookies, or storage. Seed test accounts and data; never sign in with real ones.
- Act like a user: navigate, click, fill forms, submit. Assert visible content, URL or route, network status, and zero console errors, not just that the page loaded.
- Prefer role and text locators that match visible elements; hidden duplicates (mobile menus, templates) cause false failures.
- Impact for UI changes includes shared components, layouts, global styles, and every route that renders the changed component. Check narrow viewports or dark mode when the change touches layout or theming.
- Save a screenshot per check in the sandbox as evidence. On failure, read the screenshot before calling it a regression: rule out a wrong selector or timing first.
- Out of scope: native mobile apps, desktop apps, and pixel-level visual diffs. Report them as not covered.

## Stop

Pause when the impacted flows are unclear, a scenario needs production access or real credentials, setup needs destructive or shared-resource actions, or the run keeps failing for environment reasons unrelated to the change.
