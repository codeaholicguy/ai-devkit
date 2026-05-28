---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Code Structure

```
packages/cli/src/
├── commands/agent.ts               # CLI command registration; renders ConsoleApp
└── tui/console/
    ├── ConsoleApp.tsx              # ConsoleProvider + ConsoleAppShell (all state + keyboard)
    ├── AgentListPane.tsx           # 2-line agent rows
    ├── PreviewPane.tsx             # Last-N message renderer
    ├── PreviewSection.tsx          # Runs useAgentConversation, wraps PreviewPane
    ├── StatusFooter.tsx            # Status counts + keybinding hints
    ├── ChatInput.tsx               # Controlled text input
    ├── HeaderBar.tsx               # App label + agent count
    ├── actions/
    │   ├── runAction.ts            # Subprocess dispatcher
    │   └── types.ts                # ConsoleAction discriminated union
    ├── hooks/
    │   ├── useAgentList.ts         # 3s poll for agent list
    │   ├── useAgentConversation.ts # 3s poll for conversation + LRU cache
    │   └── useTerminalSize.ts      # Debounced terminal resize
    ├── render/
    │   ├── formatStatus.tsx        # FormatStatus component
    │   ├── formatRelative.ts       # Shared relative-time formatter
    │   └── agentTypeLabel.ts       # AGENT_TYPE_LABEL / AGENT_TYPE_LABEL_DISPLAY
    └── state/
        └── ConsoleContext.tsx      # ConsoleProvider + useConsoleContext
```

## Key Implementation Notes

### Ink 7 + React 19 keyboard handling
`useInput` silently fails inside `React.memo` components. All keyboard handling lives in `ConsoleAppShell` (non-memo). Refs (`selectedNameRef`, `agentsRef`) capture current values for use inside `useInput` closures without stale closure bugs.

### Layout stability
Every `<Box>` has explicit `width` + `flexShrink={0}`. Without this, Yoga recalculates and shifts layout on every selection change. `computeLayout()` is a pure function — easy to verify and test independently.

### Conversation cache
`conversationCache` is a module-level `Map<sessionFilePath, {mtime, messages}>` with LRU eviction via `cacheSet()` (max 50). On selection change, cached messages are shown immediately while the debounced fetch checks `statSync().mtimeMs`. If mtime matches cache, no JSONL parse occurs.

### Action dispatch
`runAction` resolves the CLI entry as `process.execPath + process.execArgv + process.argv[1]` — works in both dev (tsx/ts-node) and production. Subprocess uses `stdio: ['ignore', 'pipe', 'pipe']` so it never seizes the TUI terminal.

### Quiet poll optimization
Both hooks use `setState(prev => prev)` return to skip re-renders on unchanged data:
- `useAgentList`: `agentsEqual()` compares all fields; uses `Date.parse()` not `new Date()` to avoid GC pressure
- `useAgentConversation`: `messagesEqual()` compares role + content + timestamp

### Context stability
`ConsoleContext` wraps the value in `useMemo([list, manager, inputFocused])`. Since `useAgentList` returns `prev` when nothing changed, `list` is a stable reference across quiet polls — the `useMemo` dependency doesn't trigger, so consumers don't re-render.

## Error Handling

- `useAgentList` catches `listAgents()` errors and surfaces them via `error` in context; `AgentListPane` shows the error message
- `useAgentConversation` handles: no session file, no adapter, JSONL parse error — each shown in `PreviewPane`
- `runAction` captures stderr from subprocess; resolves with `{ exitCode, error }` never rejects
- All `setState` calls in async hooks guard with `mountedRef.current && token === runTokenRef.current`

## Performance Considerations

- Poll paused during input focus (`paused: inputFocused`) to reduce competing re-renders
- Terminal resize debounced at 80ms
- `React.memo` on all leaf components (`AgentListPane`, `PreviewPane`, `StatusFooter`, `ChatInput`, `FormatStatus`, `HeaderBar`)
- `inFlightRef` prevents concurrent `listAgents()` calls when interval fires before previous fetch completes; reset at start of each effect run to prevent blocked fetch after dependency change
