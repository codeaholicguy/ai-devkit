---
title: AI DevKit Pi Integration
description: How to improve AI DevKit's Pi session detection with the @ai-devkit/pi-session-tracker package.
order: 12
---

AI DevKit can detect Pi sessions through its agent management system. For the most accurate Pi integration, install the dedicated Pi session tracker package:

```bash
pi install npm:@ai-devkit/pi-session-tracker
```

Package page: https://pi.dev/packages/@ai-devkit/pi-session-tracker

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

## How do I install it in Pi?

Run this from Pi:

```bash
pi install npm:@ai-devkit/pi-session-tracker
```

After installing, start or restart your Pi session, then check what AI DevKit can see:

```bash
ai-devkit agent list
```

## Does this replace AI DevKit setup?

No. The Pi session tracker improves Pi session visibility for AI DevKit. You should still initialize AI DevKit in your project when you want skills, memory, workflow docs, or other AI DevKit project configuration:

```bash
ai-devkit init
```

## Where can I read more?

- Pi package: https://pi.dev/packages/@ai-devkit/pi-session-tracker
- AI DevKit Agent Management: https://ai-devkit.com/docs/8-agent-management
