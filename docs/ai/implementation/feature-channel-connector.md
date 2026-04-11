---
phase: implementation
title: "Channel Connector: Implementation Guide"
description: Technical implementation details for the channel-connector package (pure messaging bridge)
---

# Implementation Guide: Channel Connector

## Development Setup

### Prerequisites
- Node.js >= 20.20.0
- npm (workspace-aware)
- Telegram account + bot created via BotFather

### Package Setup
```bash
# Package lives at packages/channel-connector/
# Build: tsc (consistent with agent-manager)
# Test: jest with ts-jest
```

## Code Structure

```
packages/channel-connector/
  src/
    index.ts                    # Public API exports
    ChannelManager.ts           # Adapter registry + lifecycle
    ConfigStore.ts              # ~/.ai-devkit/channels.json persistence
    adapters/
      ChannelAdapter.ts         # Interface definition
      TelegramAdapter.ts        # Telegraf-based implementation
    types.ts                    # Shared types (no agent concepts)
  __tests__/
    ChannelManager.test.ts
    ConfigStore.test.ts
    adapters/
      TelegramAdapter.test.ts
```

## Implementation Notes

### Core Features

**ChannelAdapter interface**: Generic messaging contract. Methods: `start()`, `stop()`, `sendMessage()`, `onMessage()`, `isHealthy()`. No agent-specific methods.

**ChannelManager**: Holds registered adapters, manages their lifecycle (startAll/stopAll). Simple registry pattern consistent with AgentManager.

**TelegramAdapter**: Wraps `telegraf` library. Uses long polling. On incoming text message: calls registered `MessageHandler` (fire-and-forget, handler returns void). `sendMessage()` allows the consumer (CLI) to push agent responses and notifications proactively.

**ConfigStore**: Simple JSON file read/write at `~/.ai-devkit/channels.json`. Creates directory if needed. Sets file permissions to 0600 for token security.

### Patterns & Best Practices

- Follow existing patterns from agent-manager (adapter registration, type exports)
- Use same tsconfig, jest config patterns as sibling packages
- Keep telegraf as the only external dependency for the Telegram adapter
- All async operations return Promises (no callbacks except MessageHandler)
- No agent-manager imports — channel-connector is a standalone package

## Integration Points

### Consumer Pattern (CLI wires both packages)
```typescript
// In CLI — this is the ONLY place where both packages meet
import { ChannelManager, TelegramAdapter, ConfigStore } from '@ai-devkit/channel-connector';
import { AgentManager, ClaudeCodeAdapter, TtyWriter } from '@ai-devkit/agent-manager';

const telegram = new TelegramAdapter({ botToken });

// Input: fire-and-forget to agent
telegram.onMessage(async (msg) => {
  await ttyWriter.write(agent.pid, msg.text); // no waiting
});

// Output: polling loop pushes agent responses to Telegram
let lastCount = 0;
setInterval(() => {
  const msgs = adapter.getConversation(agent.sessionFilePath);
  const newAssistant = msgs.slice(lastCount).filter(m => m.role === 'assistant');
  for (const m of newAssistant) {
    telegram.sendMessage(chatId, m.content);
  }
  lastCount = msgs.length;
}, 2000);

await telegram.start();
```

### Key Principle
- Channel-connector exposes: `onMessage(handler)` + `sendMessage(chatId, text)`
- CLI provides: the input handler (fire-and-forget) + the output polling loop
- Input and output are fully decoupled — agent can take any amount of time to respond

## Error Handling

- Invalid bot token → validate on connect (ConfigStore), clear error message
- Network failure → telegraf auto-reconnect + exponential backoff in TelegramAdapter
- Handler throws → catch in adapter, send error message to user in Telegram
- Config file corruption → backup and recreate with warning

## Security Notes

- Bot tokens stored at `~/.ai-devkit/channels.json` with 0600 permissions
- Chat ID allowlist prevents unauthorized users from interacting
- No secrets logged or exposed in error messages
- Token validated against Telegram API before persisting
