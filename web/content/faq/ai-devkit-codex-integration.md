---
title: AI DevKit Codex Integration
description: Configure Codex SessionStart hooks so AI DevKit can more reliably detect, inspect, and message running Codex sessions.
order: 13
---

AI DevKit can detect Codex sessions through its agent management system. For the most accurate Codex integration, install the AI DevKit Codex hook files into your Codex home directory.

The hook writes a local PID-to-session mapping at `~/.codex/ai-devkit/sessions.json`. AI DevKit uses that mapping when you run commands such as:

```bash
ai-devkit agent list
ai-devkit agent detail --id <codex-session>
ai-devkit agent send "What are you working on?" --id <codex-session>
```

Without the hook, AI DevKit may still detect Codex through local processes and session files, but the result can be less precise.

## What does the Codex hook do?

The Codex `SessionStart` hook runs when Codex starts, resumes, clears, or compacts a session. It records which Codex process belongs to which Codex session transcript.

AI DevKit then uses that local mapping to list, inspect, open, and message active Codex sessions more reliably.

## How do I install it?

Run the AI DevKit machine setup after you have launched Codex at least once:

```bash
ai-devkit setup
```

With npx only:

```bash
npx ai-devkit@latest setup
```

Setup preserves existing hook entries while adding the AI DevKit session hook. Restart Codex, start a session, and check discovery before opening the console:

```bash
ai-devkit agent list
```

For the complete setup-then-init sequence, see [Getting Started](/docs/1-getting-started).

## Manual troubleshooting

If `setup` reports a failed Codex hook step, verify that `~/.codex` exists and that you can write to it. As a recovery option, merge this `SessionStart` entry into the existing `hooks` object in `~/.codex/hooks.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume|clear|compact",
        "hooks": [
          {
            "type": "command",
            "command": "node ~/.codex/hooks/codex-session-mapping.cjs",
            "timeout": 5
          }
        ]
      }
    ]
  }
}
```

If the file already has a `SessionStart` array, add the object above to that array. Copy `codex-session-mapping.cjs` from the AI DevKit package's Codex assets into `~/.codex/hooks/`, or rerun `setup` to install the matching script automatically. Do not replace an existing hooks file wholesale.

## When should I install it?

Install it if you use Codex with AI DevKit agent management features, especially if you want AI DevKit to more reliably list, inspect, open, or message your active Codex sessions.

## Does this replace AI DevKit setup?

No. Machine setup improves Codex session visibility and installs global skills. You should still initialize AI DevKit in each project when you want workflow docs and other project configuration:

```bash
ai-devkit init
```

## Where can I read more?

- AI DevKit Agent Management: https://ai-devkit.com/docs/8-agent-management
- Codex sandbox troubleshooting: https://ai-devkit.com/faq/codex-sandbox-npx-troubleshooting
