---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown

## Task Breakdown

### Phase 1: Core Shell & Data Hooks
- [x] Task 1.1: `useAgentList` hook — polls `manager.listAgents()` every 3s, equality-checks to skip quiet re-renders, guards stale setState with run token
- [x] Task 1.2: `ConsoleProvider` / `ConsoleContext` — provides agent list + manager via context; `useMemo` on value object
- [x] Task 1.3: `useTerminalSize` — debounced resize listener on `process.stdout`
- [x] Task 1.4: `ConsoleApp` shell — `ConsoleProvider` wrapper + `ConsoleAppShell` with all keyboard handling via `useInput`

### Phase 2: Agent List Pane
- [x] Task 2.1: `AgentListPane` — 2-line rows (status+name+type / summary), fixed widths to prevent layout shift, dividers between agents
- [x] Task 2.2: `FormatStatus` — status glyph + label with colour coding
- [x] Task 2.3: Sort agents by status (WAITING → RUNNING → IDLE → UNKNOWN) via `sortBy: 'status'`

### Phase 3: Conversation Preview
- [x] Task 3.1: `useAgentConversation` hook — polls every 3s, 150ms selection debounce, LRU module-level cache (max 50 entries), run-token race guard
- [x] Task 3.2: `PreviewPane` — renders last 20 messages with role colour + timestamp; each line wrapped in `<Box>` to guarantee row breaks in Ink 7
- [x] Task 3.3: `PreviewSection` — reads context + runs `useAgentConversation`, paused during input focus

### Phase 4: Chat Input & Actions
- [x] Task 4.1: `ChatInput` — fully controlled (value/onChange lifted to `ConsoleAppShell`); dynamic line-count reporting for layout
- [x] Task 4.2: `runAction` — spawns CLI subprocess (`agent open` / `agent send`) with `stdio: pipe`; resolves via `process.execPath + execArgv + argv[1]`
- [x] Task 4.3: Transient feedback messages — 4s auto-clear; shown in `StatusFooter`

### Phase 5: Header, Footer & Layout
- [x] Task 5.1: `HeaderBar` — agent count + app label
- [x] Task 5.2: `StatusFooter` — status counts, updated time, keybinding hints
- [x] Task 5.3: `computeLayout` — pure function mapping cols/rows/inputLines → all layout dimensions
- [x] Task 5.4: Narrow mode — hides preview pane when terminal < 120 cols; shows resize hint in footer

## Dependencies

- `@ai-devkit/agent-manager` — `AgentManager`, `AgentInfo`, `ConversationMessage`, `AgentStatus`
- `ink` 7.x — TUI rendering; `useInput`, `useApp`, `Box`, `Text`
- `ink-text-input` — controlled text input component
- `react` 19.x

## Risks & Mitigation

| Risk | Mitigation |
|------|-----------|
| `useInput` silent failure in memo components | All keyboard handling in single non-memo `ConsoleAppShell` |
| Layout shift on selection change | Fixed widths + `flexShrink={0}` on all boxes |
| Unbounded conversation cache | LRU eviction at 50 entries via `cacheSet()` |
| Subprocess blocking TUI terminal | `stdio: ['ignore', 'pipe', 'pipe']` |
| Stale fetch after effect re-run | `inFlightRef.current = false` reset at start of each effect |
