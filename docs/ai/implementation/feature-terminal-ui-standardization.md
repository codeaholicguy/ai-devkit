---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

**Prerequisites:**
- Node.js and npm installed
- ai-devkit repository cloned
- Dependencies installed (`npm install`)

**Environment setup steps:**
1. Navigate to `packages/cli` directory
2. Install ora: `npm install ora`
3. Verify chalk is already installed: `npm list chalk`

**Configuration needed:**
- None (uses existing TypeScript configuration)

## Code Structure
**How is the code organized?**

**Directory structure:**
```
packages/cli/src/
├── util/
│   ├── terminal-ui.ts          # New TerminalUI utility
│   └── git.ts                  # Existing utilities
├── commands/
│   ├── init.ts                 # To be refactored
│   ├── setup.ts                # To be refactored
│   └── skill.ts                # To be refactored
└── __tests__/
    └── util/
        └── terminal-ui.test.ts # New test file
```

**Module organization:**
- `util/terminal-ui.ts`: Centralized UI utility
- Commands import and use the utility
- Tests mirror the source structure

**Naming conventions:**
- File: `terminal-ui.ts` (kebab-case)
- Export: `ui` object
- Methods: `info()`, `success()`, `warning()`, `error()`, `spinner()` (camelCase)

## Implementation Notes
**Key technical details to remember:**

### Core Features

#### 1. Message Formatting
```typescript
// Use chalk for consistent coloring
import chalk from 'chalk';

export const ui = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), message);
  },
  
  success: (message: string) => {
    console.log(chalk.green('✔'), message);
  },
  
  warning: (message: string) => {
    console.log(chalk.yellow('⚠'), message);
  },
  
  error: (message: string) => {
    console.error(chalk.red('✖'), message);
  },
};
```

#### 2. Spinner Implementation
```typescript
import ora, { Ora } from 'ora';

export const ui = {
  // ... message methods ...
  
  spinner: (text: string): Ora => {
    return ora({
      text,
      color: 'cyan',
    });
  },
};
```

#### 3. Usage in Commands
```typescript
// Before
console.log('Initializing project...');
console.error('Failed to initialize');

// After
import { ui } from '../util/terminal-ui';

ui.info('Initializing project...');
ui.error('Failed to initialize');

// With spinner
const spinner = ui.spinner('Cloning repository...');
spinner.start();
try {
  await cloneRepo();
  spinner.succeed('Repository cloned');
} catch (error) {
  spinner.fail('Failed to clone repository');
  ui.error(error.message);
}
```

### Patterns & Best Practices

**1. Consistent message structure:**
- Use present continuous for ongoing actions: "Initializing...", "Cloning..."
- Use past tense for completed actions: "Initialized", "Cloned"
- Keep messages concise and descriptive

**2. Spinner lifecycle:**
```typescript
const spinner = ui.spinner('Loading...');
spinner.start();

try {
  await asyncOperation();
  spinner.succeed('Loaded successfully');
} catch (error) {
  spinner.fail('Failed to load');
  ui.error(error.message); // Additional error details
} finally {
  // Spinner is already stopped by succeed/fail
}
```

**3. Error handling:**
- Use `spinner.fail()` for operation-specific failures
- Use `ui.error()` for additional error context
- Always provide actionable error messages

**4. Testing patterns:**
```typescript
import { ui } from '../terminal-ui';

// Mock console methods
const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

// Test message output
ui.info('test message');
expect(consoleSpy).toHaveBeenCalledWith(
  expect.stringContaining('ℹ'),
  'test message'
);

consoleSpy.mockRestore();
```

## Integration Points
**How do pieces connect?**

**Command integration:**
- Each command imports `ui` from `../util/terminal-ui`
- Replace all `console.log` → `ui.info` or `ui.success`
- Replace all `console.error` → `ui.error`
- Add spinners for async operations

**Library integration:**
- chalk: Used internally by terminal-ui
- ora: Used internally by terminal-ui
- Commands don't need to import these directly

## Error Handling
**How do we handle failures?**

**Error handling strategy:**
1. Spinner fails gracefully if terminal doesn't support it
2. Messages fall back to plain text if colors aren't supported
3. No errors thrown from UI utility (defensive coding)

**Logging approach:**
- All output goes to stdout (info, success, warning)
- Errors go to stderr (error messages)
- Spinners use stdout

**Retry/fallback mechanisms:**
- If ora fails to initialize, fall back to simple console.log
- If chalk colors aren't supported, use plain text

## Performance Considerations
**How do we keep it fast?**

**Optimization strategies:**
- Lazy-load ora only when spinner is needed
- Reuse chalk instances
- Avoid unnecessary string operations

**Caching approach:**
- No caching needed (stateless operations)

**Resource management:**
- Ensure spinners are always stopped (use try/finally)
- Don't create multiple spinners simultaneously

## Security Notes
**What security measures are in place?**

**Input validation:**
- Sanitize messages to prevent terminal injection
- Escape special characters in user-provided strings

**Example:**
```typescript
const sanitize = (message: string): string => {
  // Remove ANSI escape codes from user input
  return message.replace(/\x1b\[[0-9;]*m/g, '');
};

export const ui = {
  info: (message: string) => {
    console.log(chalk.blue('ℹ'), sanitize(message));
  },
  // ... other methods ...
};
```

**Secrets management:**
- Never log sensitive information (tokens, passwords, etc.)
- Add warnings in documentation about what not to log
