---
phase: implementation
title: Display CWD in Agent List — Implementation
description: Implementation notes for CWD column feature
---

# Display CWD in Agent List — Implementation

## Files to Modify

| File | Change |
|------|--------|
| `packages/cli/src/commands/agent.ts` | Add `formatCwd()` helper, add CWD column to table |
| `packages/cli/src/__tests__/commands/agent.test.ts` | Update tests for new column |

## Implementation Notes

### `formatCwd(projectPath: string): string`

```typescript
import os from 'os';

function formatCwd(projectPath?: string): string {
    if (!projectPath) return '';
    const home = os.homedir();
    if (projectPath.startsWith(home)) {
        return '~' + projectPath.slice(home.length);
    }
    return projectPath;
}
```

### Table changes

- Insert at index 1 in: headers, rows mapping, columnStyles
- Header: `'CWD'`
- Row value: `formatCwd(agent.projectPath)`
- Style: `(text) => chalk.dim(text)`
