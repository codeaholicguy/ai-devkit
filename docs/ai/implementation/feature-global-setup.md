---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
feature: global-setup
---

# Implementation Guide - Global Setup Feature

## Development Setup
**How do we get started?**

- Prerequisites: Node.js, npm, project already set up
- Run `npm install` to ensure dependencies are installed
- Run `npm run build` to verify TypeScript compilation

## Code Structure
**How is the code organized?**

Files to modify/create:
```
src/
├── types.ts                    # Add globalCommandPath to EnvironmentDefinition
├── util/
│   └── env.ts                  # Add global support flags and helper functions
├── lib/
│   ├── EnvironmentSelector.ts  # Add selectGlobalEnvironments method
│   └── TemplateManager.ts      # Add copyCommandsToGlobal method
├── commands/
│   ├── init.ts                 # Existing (no changes needed)
│   └── setup.ts                # NEW: Global setup command
└── cli.ts                      # Add setup command
```

## Implementation Notes
**Key technical details to remember:**

### Home Directory Resolution
```typescript
import * as os from 'os';
import * as path from 'path';

const homeDir = os.homedir();
const globalPath = path.join(homeDir, env.globalCommandPath);
```

### EnvironmentDefinition Update
```typescript
export interface EnvironmentDefinition {
  // ... existing properties
  globalCommandPath?: string; // Path relative to home directory (without ~)
}
```

### Global-capable Environment Filtering
```typescript
export function getGlobalCapableEnvironments(): EnvironmentDefinition[] {
  return getAllEnvironments().filter(env => env.globalCommandPath !== undefined);
}
```

### Patterns & Best Practices
- Reuse existing `copyCommands` logic for consistency
- Use `fs-extra` for all file operations (already a dependency)
- Follow existing error handling patterns from `init.ts`
- Use `chalk` for colored output (already imported)

## Integration Points
**How do pieces connect?**

1. CLI parses `setup --global` command
2. `setupCommand()` calls `EnvironmentSelector.selectGlobalEnvironments()`
3. For each selected environment, `TemplateManager.checkGlobalCommandsExist()` checks for existing files
4. If files exist, prompt user for overwrite confirmation
5. `TemplateManager.copyCommandsToGlobal()` copies commands to global folder
6. Display success/error messages

## Error Handling
**How do we handle failures?**

- Wrap file operations in try/catch blocks
- Provide clear error messages with suggested fixes
- Don't exit on first error - try to complete as much as possible
- Log warnings for non-critical issues (e.g., file already skipped)

## Security Notes
**What security measures are in place?**

- Only write to user's home directory (no system directories)
- Prompt before overwriting existing files
- No network requests or external dependencies
