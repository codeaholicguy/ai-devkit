---
name: ai-devkit-setup
description: AI DevKit · Check local AI DevKit readiness and run setup only when status shows onboarding or harness integration gaps.
---

# AI DevKit Setup

Use this skill when a user wants to onboard AI DevKit, prepare a harness, repair local AI DevKit integration, or check whether setup is needed.

Keep the workflow status-driven and simple. Prefer the installed `ai-devkit` binary; if it is unavailable, use `npx ai-devkit@latest`.

## Workflow

1. Run readiness first:

   ```bash
   ai-devkit status --json
   ```

2. Read the report and identify failed or warning checks that setup can actually address. Setup covers supported local agent integrations such as hooks, built-in skills, and session tracking for `codex`, `pi`, and `claude`; it does not fix unrelated requirements such as missing authentication, unavailable package managers, or host tools that need user installation.

3. If setup-repairable checks are missing or failed, run the narrowest setup command:

   ```bash
   ai-devkit setup --agent codex
   ai-devkit setup --agent pi
   ai-devkit setup --agent claude
   ```

   Use comma-separated agents when more than one detected harness needs setup:

   ```bash
   ai-devkit setup --agent codex,claude
   ```

   If the user asked for broad onboarding and status shows several supported harnesses present, `ai-devkit setup` is acceptable.

4. Re-run `ai-devkit status --json` after setup and report what changed. Mention any remaining failures as concrete next steps, especially manual actions like signing in to a harness or installing `tmux`.

## Boundaries

- Do not run setup before checking status unless the user explicitly asks to force setup.
- Do not claim setup is complete without a fresh status check from this session.
- Do not modify secrets, auth tokens, or unrelated harness config manually. Point the user to the failing status item instead.
- Ask before destructive cleanup or replacing existing user-managed configuration.
- Keep output concise: status command, setup command if run, final readiness, and remaining user actions.
