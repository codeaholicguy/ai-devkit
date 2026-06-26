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

From the AI DevKit repository root, create the Codex hooks directory and copy the hook script:

```bash
mkdir -p ~/.codex/hooks
cp hooks/codex/hooks/codex-session-mapping.cjs ~/.codex/hooks/codex-session-mapping.cjs
```

Then copy the AI DevKit Codex hook configuration:

```bash
cp hooks/codex/hooks.json ~/.codex/hooks.json
```

Restart Codex, then check what AI DevKit can see:

```bash
ai-devkit agent list
```

## What if I already have ~/.codex/hooks.json?

Do not overwrite an existing `~/.codex/hooks.json` if it contains other hooks you want to keep. Instead, merge this `SessionStart` entry into your existing `hooks` object:

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

If your file already has a `SessionStart` array, add the object above to that array.

## When should I install it?

Install it if you use Codex with AI DevKit agent management features, especially if you want AI DevKit to more reliably list, inspect, open, or message your active Codex sessions.

## Does this replace AI DevKit setup?

No. The Codex hook improves Codex session visibility for AI DevKit. You should still initialize AI DevKit in your project when you want skills, memory, workflow docs, or other AI DevKit project configuration:

```bash
ai-devkit init
```

## Where can I read more?

- AI DevKit Agent Management: https://ai-devkit.com/docs/8-agent-management
- Codex sandbox troubleshooting: https://ai-devkit.com/faq/codex-sandbox-npx-troubleshooting
