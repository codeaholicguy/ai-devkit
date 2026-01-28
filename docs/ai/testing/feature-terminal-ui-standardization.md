---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- **Unit test coverage target**: 100% of terminal-ui.ts
- **Integration test scope**: All commands using the UI utility
- **End-to-end test scenarios**: Manual testing of all commands
- **Alignment with requirements**: All acceptance criteria must be testable

## Unit Tests
**What individual components need testing?**

### TerminalUI Utility (`src/util/terminal-ui.ts`)

#### Message Methods
- [ ] **Test: info() displays blue info message**
  - Verify console.log is called
  - Verify message includes blue color code
  - Verify message includes ℹ symbol

- [ ] **Test: success() displays green success message**
  - Verify console.log is called
  - Verify message includes green color code
  - Verify message includes ✔ symbol

- [ ] **Test: warning() displays yellow warning message**
  - Verify console.log is called
  - Verify message includes yellow color code
  - Verify message includes ⚠ symbol

- [ ] **Test: error() displays red error message**
  - Verify console.error is called (not console.log)
  - Verify message includes red color code
  - Verify message includes ✖ symbol

- [ ] **Test: Messages sanitize special characters**
  - Test with ANSI escape codes in input
  - Verify they are stripped/escaped
  - Prevent terminal injection

#### Spinner Methods
- [ ] **Test: spinner() creates ora instance**
  - Verify ora is called with correct options
  - Verify returned object has start/succeed/fail methods

- [ ] **Test: spinner() accepts custom text**
  - Create spinner with specific text
  - Verify text is passed to ora

- [ ] **Test: spinner lifecycle methods work**
  - Test start(), succeed(), fail(), warn(), stop()
  - Verify they call corresponding ora methods

### Edge Cases
- [ ] **Test: Empty message strings**
  - Verify methods handle empty strings gracefully

- [ ] **Test: Very long messages**
  - Test with 1000+ character messages
  - Verify no crashes or truncation issues

- [ ] **Test: Special characters in messages**
  - Test with Unicode, emojis, newlines
  - Verify proper handling

- [ ] **Test: Rapid successive calls**
  - Call methods 100+ times rapidly
  - Verify no performance degradation

## Integration Tests
**How do we test component interactions?**

### Command Integration
- [ ] **Integration: init command uses UI utility**
  - Run init command
  - Verify no console.log/error calls
  - Verify ui methods are called instead

- [ ] **Integration: setup command uses UI utility**
  - Run setup command
  - Verify spinners appear for file operations
  - Verify success/error messages use ui methods

- [ ] **Integration: skill command uses UI utility**
  - Run skill install command
  - Verify spinner appears during git clone
  - Verify success message uses ui.success()

- [ ] **Integration: Error scenarios**
  - Trigger errors in each command
  - Verify ui.error() is called
  - Verify error messages are formatted correctly

## End-to-End Tests
**What user flows need validation?**

### Manual Testing Checklist
- [ ] **E2E: Run `ai-devkit init` in new directory**
  - Verify consistent message formatting
  - Verify colors appear correctly
  - Verify no raw console.log output

- [ ] **E2E: Run `ai-devkit setup` with various options**
  - Verify spinners appear during operations
  - Verify success messages after completion
  - Verify error messages if operations fail

- [ ] **E2E: Run `ai-devkit skill install <skill>`**
  - Verify spinner during git clone
  - Verify success message after install
  - Verify error handling for invalid skills

- [ ] **E2E: Run all commands in CI environment**
  - Verify output works without TTY
  - Verify colors are disabled appropriately
  - Verify spinners degrade gracefully

- [ ] **E2E: Test in different terminals**
  - macOS Terminal.app
  - iTerm2
  - VS Code integrated terminal
  - Linux terminal (if available)

## Test Data
**What data do we use for testing?**

**Mocks:**
```typescript
// Mock chalk
jest.mock('chalk', () => ({
  blue: (text: string) => `[BLUE]${text}[/BLUE]`,
  green: (text: string) => `[GREEN]${text}[/GREEN]`,
  yellow: (text: string) => `[YELLOW]${text}[/YELLOW]`,
  red: (text: string) => `[RED]${text}[/RED]`,
}));

// Mock ora
jest.mock('ora', () => {
  return jest.fn(() => ({
    start: jest.fn(),
    succeed: jest.fn(),
    fail: jest.fn(),
    warn: jest.fn(),
    stop: jest.fn(),
    text: '',
  }));
});
```

**Test messages:**
- Short: "Test"
- Medium: "This is a test message"
- Long: 1000+ character string
- Special: "Test\nwith\nnewlines", "Test with 🎉 emoji"
- Malicious: "\x1b[31mInjected color\x1b[0m"

## Test Reporting & Coverage
**How do we verify and communicate test results?**

**Coverage commands:**
```bash
# Run tests with coverage
npm test -- --coverage

# Run tests for specific file
npm test -- terminal-ui.test.ts

# Watch mode during development
npm test -- --watch terminal-ui.test.ts
```

**Coverage thresholds:**
- terminal-ui.ts: 100% coverage required
- Commands: Verify UI methods are called (integration tests)

**Coverage gaps:**
- If any lines are not covered, document why and add tests

## Manual Testing
**What requires human validation?**

### Visual Testing Checklist
- [ ] **Colors are visually distinct**
  - Info (blue) vs Success (green) vs Warning (yellow) vs Error (red)
  - Symbols are clearly visible

- [ ] **Spinners animate smoothly**
  - No flickering or jumping
  - Proper cleanup after completion

- [ ] **Messages are readable**
  - No text wrapping issues
  - Proper spacing and alignment

- [ ] **Error messages are helpful**
  - Clear indication of what went wrong
  - Actionable guidance when possible

### Terminal Compatibility
- [ ] Test in macOS Terminal
- [ ] Test in iTerm2
- [ ] Test in VS Code terminal
- [ ] Test in CI environment (GitHub Actions)

### Accessibility
- [ ] Messages are readable without color (symbols help)
- [ ] Screen reader compatibility (if applicable)

## Performance Testing
**How do we validate performance?**

### Performance Benchmarks
- [ ] **Benchmark: Message display overhead**
  - Measure time to display 1000 messages
  - Target: < 1ms per message

- [ ] **Benchmark: Spinner creation overhead**
  - Measure time to create and start spinner
  - Target: < 5ms

- [ ] **Benchmark: Command execution time**
  - Compare before/after refactor
  - Target: No noticeable difference (< 10ms)

**Performance test script:**
```typescript
// packages/cli/src/__tests__/performance/terminal-ui.perf.ts
import { ui } from '../../util/terminal-ui';

describe('Performance', () => {
  it('displays 1000 messages quickly', () => {
    const start = Date.now();
    for (let i = 0; i < 1000; i++) {
      ui.info(`Message ${i}`);
    }
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // < 1s for 1000 messages
  });
});
```

## Bug Tracking
**How do we manage issues?**

### Known Issues
- None yet (new feature)

### Testing Sign-off Criteria
- [ ] All unit tests pass with 100% coverage
- [ ] All integration tests pass
- [ ] All manual E2E tests completed successfully
- [ ] Performance benchmarks meet targets
- [ ] No console.log/error calls remain in commands
- [ ] Documentation is updated

### Regression Testing
- [ ] Verify existing command functionality unchanged
- [ ] Verify no breaking changes to CLI API
- [ ] Verify backward compatibility
