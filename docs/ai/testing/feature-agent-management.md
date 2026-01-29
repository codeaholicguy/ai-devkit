---
phase: testing
title: Testing Strategy
description: Define testing approach, test cases, and quality assurance
feature: agent-management
---

# Testing Strategy

## Test Coverage Goals
**What level of testing do we aim for?**

- **Unit test coverage**: 100% of new/changed code
- **Integration test scope**: AgentManager + ClaudeCodeAdapter integration
- **End-to-end test scenarios**: CLI command with real Claude Code sessions
- Alignment with requirements/design acceptance criteria

## Unit Tests
**What individual components need testing?**

### Process Utilities (`util/process.ts`)
- [ ] `listProcesses()` returns empty array when no matching processes
- [ ] `listProcesses()` correctly parses process info (PID, command, cwd)
- [ ] `listProcesses()` filters by pattern correctly
- [ ] `listProcesses()` handles malformed `ps` output gracefully

### AgentAdapter Interface (`lib/adapters/AgentAdapter.ts`)
- [ ] Type definitions compile correctly
- [ ] AgentStatus enum values are valid

### AgentManager (`lib/AgentManager.ts`)
- [ ] `registerAdapter()` adds adapter to list
- [ ] `listAgents()` returns empty array when no adapters registered
- [ ] `listAgents()` aggregates results from multiple adapters
- [ ] `listAgents()` continues when one adapter fails, returns partial results
- [ ] `listAgents()` handles adapter throwing error gracefully

### ClaudeCodeAdapter (`lib/adapters/ClaudeCodeAdapter.ts`)

#### Session Reading
- [ ] Correctly reads `~/.claude/projects/*/` directories
- [ ] Handles missing `~/.claude/projects/` directory
- [ ] Parses `sessions-index.json` correctly
- [ ] Reads session JSONL files
- [ ] Reads `history.jsonl` for user prompts
- [ ] Extracts session slug from entries

#### Status Detection
- [ ] Detects "running" when last entry type is `assistant` or `progress`
- [ ] Detects "waiting" when last entry type is `user`
- [ ] Detects "idle" when timestamp is > 5 minutes old
- [ ] Returns "unknown" when status cannot be determined
- [ ] Returns correct emoji display (🟡 wait, 🟢 run, ⚪ idle)

#### Summary and Time Extraction
- [ ] Extracts summary from `history.jsonl` `display` field
- [ ] Truncates long summaries to ~40 characters with ellipsis
- [ ] Returns "Session started" fallback when no history
- [ ] Calculates relative time correctly ("just now", "2m ago", "1h ago")

#### Agent Naming
- [ ] Uses project basename when unique
- [ ] Appends truncated slug when multiple sessions same project
- [ ] Falls back to full slug when no project path

#### Full Adapter
- [ ] `detectAgents()` correlates processes with sessions
- [ ] Filters out stale sessions (no matching process)
- [ ] Sorts agents: waiting first, then running, then idle
- [ ] Returns empty array when no Claude Code running

### CLI Command (`commands/agent.ts`)
- [ ] `agent list` command is registered correctly
- [ ] Displays table with headers: Agent, Status, Working On, Active
- [ ] Status column shows emoji + label (🟡 wait, 🟢 run, ⚪ idle)
- [ ] Active column shows relative time
- [ ] Shows attention footer when agents waiting (e.g., "💡 1 agent waiting...")
- [ ] Shows actionable guidance when no agents found
- [ ] `--json` flag outputs valid JSON with all AgentInfo fields

## Integration Tests
**How do we test component interactions?**

### AgentManager + ClaudeCodeAdapter
- [ ] Manager correctly calls adapter's `detectAgents()`
- [ ] Results from adapter appear in manager's `listAgents()` output
- [ ] Adapter registration and detection flow works end-to-end

### ClaudeCodeAdapter + File System
- [ ] Reads real file structure from test fixtures
- [ ] Handles various log file formats

### CLI + AgentManager
- [ ] Command invokes AgentManager correctly
- [ ] Output formatting matches expected table format

## End-to-End Tests
**What user flows need validation?**

### E2E-1: List with Active Claude Code Session
**Precondition**: Claude Code running in a terminal
- [ ] Run `ai-devkit agent list`
- [ ] Verify table shows agent with project-based name
- [ ] Verify status shows 🟢 run or 🟡 wait
- [ ] Verify "Working On" shows user's prompt
- [ ] Verify "Active" shows relative time

### E2E-2: List with No Agents
**Precondition**: No AI agents running
- [ ] Run `ai-devkit agent list`
- [ ] Verify warning message is displayed
- [ ] Verify actionable guidance shown ("Start a Claude Code session with: claude")
- [ ] Verify exit code is 0

### E2E-3: List with Multiple Agents
**Precondition**: 2+ Claude Code sessions in different terminals
- [ ] Run `ai-devkit agent list`
- [ ] Verify all agents appear in table
- [ ] Verify agents sorted by status (waiting first)
- [ ] Verify each has a unique name

### E2E-4: JSON Output
**Precondition**: At least one Claude Code running
- [ ] Run `ai-devkit agent list --json`
- [ ] Verify output is valid JSON array
- [ ] Verify each object has: name, type, status, summary, projectPath, sessionId, pid, lastActive

### E2E-5: Attention Footer
**Precondition**: At least one Claude Code waiting for input
- [ ] Run `ai-devkit agent list`
- [ ] Verify footer shows "💡 X agent(s) waiting for input..."

## Test Data
**What data do we use for testing?**

### Test Fixtures
Create mock data in `packages/cli/src/__tests__/fixtures/`:

```
fixtures/
└── agent/
    └── claude-code/
        ├── projects/
        │   └── -Users-test-my-project/
        │       ├── sessions-index.json
        │       ├── session-running.jsonl
        │       ├── session-waiting.jsonl
        │       └── session-idle.jsonl
        └── history.jsonl
```

### Sample Session JSONL Fixtures

**session-running.jsonl** (last entry is assistant):
```json
{"type":"user","timestamp":"2026-01-29T09:10:00.000Z","slug":"merry-wobbling-starlight"}
{"type":"assistant","timestamp":"2026-01-29T09:10:05.000Z","slug":"merry-wobbling-starlight"}
{"type":"progress","timestamp":"2026-01-29T09:10:10.000Z","slug":"merry-wobbling-starlight"}
```

**session-waiting.jsonl** (last entry is user):
```json
{"type":"assistant","timestamp":"2026-01-29T09:09:00.000Z","slug":"calm-dancing-river"}
{"type":"user","timestamp":"2026-01-29T09:10:00.000Z","slug":"calm-dancing-river"}
```

**session-idle.jsonl** (old timestamp):
```json
{"type":"assistant","timestamp":"2026-01-29T08:00:00.000Z","slug":"quiet-sleeping-mountain"}
```

**history.jsonl**:
```json
{"display":"build an authentication API","timestamp":1769677800000,"project":"/Users/test/my-project","sessionId":"abc123"}
```

### Mock Process Data
```typescript
const mockProcesses: ProcessInfo[] = [
  { pid: 12345, command: 'claude', cwd: '/Users/test/project-a' },
  { pid: 12346, command: 'claude', cwd: '/Users/test/project-b' },
];
```

## Test Reporting & Coverage
**How do we verify and communicate test results?**

### Coverage Commands
```bash
# Run tests with coverage
npm run test -- --coverage

# View coverage report
open coverage/lcov-report/index.html
```

### Coverage Thresholds
```json
{
  "coverageThreshold": {
    "global": {
      "branches": 80,
      "functions": 100,
      "lines": 80,
      "statements": 80
    }
  }
}
```

### Coverage Gaps
Document any files/functions below 100% with rationale:
- Platform-specific code paths (e.g., Windows support)
- Error handling for rare edge cases

## Manual Testing
**What requires human validation?**

### Pre-Testing Checklist
- [ ] Claude Code is installed
- [ ] At least one Claude Code session is running
- [ ] ai-devkit CLI is built (`npm run build`)

### Manual Test Cases

#### MT-1: Basic List
```bash
# Start Claude Code in a project
cd ~/some-project && claude

# In another terminal
ai-devkit agent list
```
**Expected**: Table shows the running agent

#### MT-2: Status Accuracy
```bash
# Start Claude Code and give it a task
# Wait for it to start processing
ai-devkit agent list
```
**Expected**: Status shows "running" during processing

#### MT-3: Summary Relevance
```bash
# Ask Claude Code to "build an authentication API"
# Wait for it to start
ai-devkit agent list
```
**Expected**: Summary reflects the current task

#### MT-4: Multiple Sessions
```bash
# Open 3 terminals, start Claude Code in each
ai-devkit agent list
```
**Expected**: All 3 agents appear with distinct names

## Performance Testing
**How do we validate performance?**

### Benchmark Scenarios
| Scenario | Target | How to Test |
|----------|--------|-------------|
| 1 agent | < 200ms | Time command with single Claude session |
| 5 agents | < 400ms | Time command with 5 Claude sessions |
| 10 agents | < 500ms | Time command with 10 Claude sessions |
| Large log file (10MB) | < 1s | Create large test log, time parsing |

### Performance Test Script
```typescript
// packages/cli/src/__tests__/performance/agent-list.perf.ts
describe('Agent List Performance', () => {
  it('should list 10 agents under 500ms', async () => {
    const start = Date.now();
    await agentManager.listAgents();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(500);
  });
});
```

## Bug Tracking
**How do we manage issues?**

### Issue Labels
- `agent-management`: Feature area
- `bug`: Something broken
- `enhancement`: Feature improvement
- `p0-critical`: Blocks usage
- `p1-high`: Significant impact
- `p2-medium`: Moderate impact
- `p3-low`: Minor issue

### Regression Testing
After each fix:
1. Add test case covering the bug
2. Run full test suite
3. Verify fix with manual testing
