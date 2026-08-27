---
title: AI DevKit Pi Integration
description: How to improve AI DevKit's Pi session detection with the @ai-devkit/pi-session-tracker package.
order: 12
---

AI DevKit can detect Pi sessions through its agent management system. For the most accurate integration, launch Pi at least once and run the AI DevKit machine setup:

```bash
ai-devkit setup
```

With npx only:

```bash
npx ai-devkit@latest setup
```

Setup installs the dedicated Pi session tracker and built-in AI DevKit skills for detected agents. For the complete setup-then-init sequence, see [Getting Started](/docs/1-getting-started).

## What does the Pi session tracker do?

`@ai-devkit/pi-session-tracker` helps AI DevKit identify active Pi sessions with better session metadata than process detection alone.

This matters when you use commands such as:

```bash
ai-devkit agent list
ai-devkit agent detail --id <pi-session>
ai-devkit agent send "What are you working on?" --id <pi-session>
```

Without the tracker, AI DevKit may still detect Pi through local processes, but the result can be less precise.

## When should I install it?

Install it if you use Pi with AI DevKit agent management features, especially if you want AI DevKit to more reliably list, inspect, or message your active Pi sessions.

## Manual troubleshooting

If the Pi tracker step fails during `setup`, retry its underlying installation command:

```bash
pi install npm:@ai-devkit/pi-session-tracker
```

After installing, start or restart your Pi session, then check what AI DevKit can see:

```bash
ai-devkit agent list
```

## Does this replace AI DevKit setup?

No. Machine setup improves Pi session visibility and installs global skills. You should still initialize AI DevKit in each project when you want workflow docs and other project configuration:

```bash
ai-devkit init
```

## Where can I read more?

- Pi package: https://pi.dev/packages/@ai-devkit/pi-session-tracker
- AI DevKit Agent Management: https://ai-devkit.com/docs/8-agent-management
