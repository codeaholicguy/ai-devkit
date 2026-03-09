---
phase: implementation
title: "Agent List Type Column - Implementation"
description: Implementation notes for adding type column
---

# Implementation: Agent List Type Column

## Code Structure

**Files to modify:**
- `packages/cli/src/commands/agent.ts` — main change (formatType helper + table update)
- `packages/cli/src/__tests__/commands/agent.test.ts` — test updates

## Implementation Notes

### `formatType()` helper

```typescript
function formatType(type: AgentType): string {
    const labels: Record<AgentType, string> = {
        claude: 'Claude Code',
        codex: 'Codex',
        gemini_cli: 'Gemini CLI',
        other: 'Other',
    };
    return labels[type] ?? type;
}
```

### Table changes

- Insert "Type" header at index 1
- Insert `formatType(agent.type)` in row at index 1
- Insert column style at index 1 (standard text, no special coloring)
