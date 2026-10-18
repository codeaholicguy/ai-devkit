---
title: Per-Harness Permission Setup
description: Minimum allow-lists and config files so Claude Code, Codex, OpenCode, and Gemini CLI workers accept ai-devkit orchestration without stalling on prompts.
slug: permissions
section: workflows
order: 6
---

Unattended multi-agent runs fail when a worker stops for tool approval, hook review, or trust dialogs. This page lists settings that worked for **ai-devkit 0.70.1 on Linux** in real orchestration demos. Other harnesses need community verification — contribute notes via [GitHub issues](https://github.com/Codeaholicguy/ai-devkit/issues).

> **Safety:** These presets grant broad shell and file access. Use isolated git worktrees, avoid secrets in the environment, and run `verify` (or your test suite) before merging. See [Multi-agent orchestration](/docs/17-multi-agent-orchestration).

## Summary matrix

| Harness | Config location | Login-free option on demo box | Doc status |
|---------|-----------------|------------------------------|------------|
| Claude Code | `.claude/settings.json` | Local endpoint possible; slow on small models | Verified |
| Codex | `.codex/config.toml` + `~/.codex/config.toml` trust | Local endpoint; tool use needs a capable model | Verified |
| OpenCode | `opencode.json` / `~/.config/opencode/opencode.jsonc` | Free cloud models (pick one that responds) | Verified |
| Gemini CLI | `.gemini/settings.json` + trusted folders | Requires Google API key / login | Verified |
| Pi, Copilot, Grok, Kiro, Devin, Muse, Antigravity CLI | Varies | Mostly requires provider login | Needs contribution |

## Claude Code (lead or worker)

**Project** `.claude/settings.json` (example):

```json
{
  "permissions": {
    "allow": [
      "Bash(ai-devkit:*)",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(node:*)",
      "Bash(sleep:*)",
      "Read",
      "Edit",
      "Write"
    ]
  },
  "defaultMode": "acceptEdits",
  "additionalDirectories": ["/absolute/path/to/sibling-worktrees"]
}
```

**Trust:** Accept the workspace trust dialog once, or set `hasTrustDialogAccepted` under `projects` in `~/.claude.json`.

**Gotchas (demo-tested):**

- Allow rules do **not** cover `cd dir && git …` (VCS-after-cd check), commands with `&`, or `tmux capture-pane`. Lead rules should use `git -C`, harness background tools instead of `&`, and no tmux from the lead.
- Project `defaultMode: "bypassPermissions"` was not observed to apply in demos; do not rely on it for orchestration.
- Long `send --wait` calls may need higher `BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` in the environment.

## Codex (worker or lead)

**Project** `.codex/config.toml`:

```toml
approval_policy = "never"
sandbox_mode = "workspace-write"
```

A **lead** that runs `ai-devkit` against sibling worktrees and the tmux socket may need `sandbox_mode = "danger-full-access"` so the sandbox can reach `~/.ai-devkit` and system paths.

**Trust:** In `~/.codex/config.toml`:

```toml
[projects."/absolute/path/to/project"]
trust_level = "trusted"
```

**SessionStart hook:** The curated ai-devkit Codex plugin registers a hook that expects `~/.codex/hooks/codex-session-mapping.cjs`. If that file is missing, Codex 0.163+ can block on **"1 hook needs review"** and swallow the first `send`.

- Run `ai-devkit setup --agent codex` to install hook assets.
- Or disable hooks: `[features] hooks = false` in `~/.codex/config.toml`.

See [Codex integration FAQ](/faq/ai-devkit-codex-integration).

## OpenCode (worker)

**`opencode.json`** (project) or user config:

```json
{
  "permission": {
    "bash": "allow",
    "edit": "allow",
    "external_directory": "allow"
  }
}
```

Pick a model that answers reliably; free tiers can rate-limit or hang. Demo used a responsive free model rather than one that stalled.

## Gemini CLI (worker)

**Project** `.gemini/settings.json`:

```json
{
  "general": {
    "defaultApprovalMode": "auto_edit"
  },
  "tools": {
    "allowed": [
      "run_shell_command(ai-devkit)",
      "run_shell_command(git)",
      "run_shell_command(npm)"
    ]
  }
}
```

Add the project directory to `~/.gemini/trustedFolders.json` or workspace settings are ignored.

**YOLO mode:** `--approval-mode=yolo` is a **CLI flag only**. `ai-devkit agent start` does not pass harness args; use [Agent Console](/docs/13-agent-console) **args**, a PATH shim on the tmux server, or start Gemini manually in tmux.

## Harnesses not covered here

Pi, Copilot, Grok CLI, Kiro, Devin, Muse, and Antigravity CLI support `agent start --type …` but were not fully exercised in the orchestration demos. Use `ai-devkit status` as a hint only — it can report false positives/negatives for auth (see [Status & Capacity](/docs/15-capacity)). Test login and permissions in your environment before unattended runs.

## Related

- [Multi-agent orchestration](/docs/17-multi-agent-orchestration)
- [Troubleshooting: Agents & Orchestration](/docs/18-troubleshooting-agents)
- [Agent Management](/docs/8-agent-management)
