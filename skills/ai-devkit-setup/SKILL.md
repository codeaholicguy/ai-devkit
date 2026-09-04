---
name: ai-devkit-setup
description: AI DevKit · Check local AI DevKit readiness and run setup only when status shows onboarding or harness integration gaps.
---

# AI DevKit Setup

Use this skill when a user wants to onboard AI DevKit, prepare a harness, repair local AI DevKit integration, or check whether setup is needed.

Keep the workflow status-driven and simple. Prefer the installed `ai-devkit` binary; if it is unavailable, use `npx ai-devkit@latest`.

## Execution Notes

- Under filesystem sandboxing, run `ai-devkit status --json` and any `ai-devkit setup` command outside the sandbox. These commands inspect and modify host-level agent configuration; sandboxed runs can produce false failures or block setup writes, especially for integrations that execute harness commands and access paths like `~/.pi/agent`.

## Workflow

1. Run readiness first:

   ```bash
   ai-devkit status --json
   ```

2. Identify failed or warning checks that setup can fix. Setup covers local integrations like hooks, built-in skills, and session tracking for `codex`, `pi`, and `claude`; it does not fix auth, missing package managers, or host tools requiring user installation.

3. Run the narrowest setup command, for example:

   ```bash
   ai-devkit setup --agent codex,pi,claude
   ```

   If the user asked for broad onboarding and several supported harnesses need setup, `ai-devkit setup` is acceptable.

4. Re-run `ai-devkit status --json` and report what changed plus any remaining manual actions.

## Boundaries

- Do not run setup before checking status unless the user explicitly asks to force setup.
- Do not claim setup is complete without a fresh status check from this session.
- Do not modify secrets, auth tokens, or unrelated harness config manually. Point the user to the failing status item instead.
- Ask before destructive cleanup or replacing existing user-managed configuration.
- Keep output concise: status command, setup command if run, final readiness, and remaining user actions.
