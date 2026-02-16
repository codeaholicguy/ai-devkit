# Phase 6: Code Review

Perform a local code review **before** pushing changes.

## Step 1: Gather Context

Ask for:
- Brief feature/branch description
- List of modified files (with optional summaries)
- Relevant design doc(s)
- Known constraints or risky areas
- Open bugs or TODOs linked to this work
- Which tests have been run

Request the latest diff: `git status -sb` and `git diff --stat`

## Step 2: Understand Design Alignment

For each provided design doc:
- Summarize architectural intent
- Note critical requirements, patterns, or constraints

## Step 3: File-by-File Review

For every modified file:
1. Deviations from design or requirements
2. Logic or flow issues and edge cases
3. Redundant or duplicate code
4. Simplification opportunities (clarity over cleverness)
5. Security concerns (input validation, secrets, auth, data handling)
6. Performance pitfalls or scalability risks
7. Error handling, logging, and observability
8. Missing comments or docs
9. Missing or outdated tests

## Step 4: Cross-Cutting Concerns

- Naming consistency and project conventions
- Documentation/comments updated where behavior changed
- Missing tests (unit, integration, E2E)
- Configuration/migration updates captured

## Step 5: Summarize Findings

```
### Summary
- Blocking issues: [count]
- Important follow-ups: [count]
- Nice-to-have improvements: [count]

### Detailed Notes
1. **[File or Component]**
   - Issue/Observation: ...
   - Impact: blocking / important / nice-to-have
   - Recommendation: ...
   - Design reference: [...]

### Recommended Next Steps
- [ ] Address blocking issues
- [ ] Update design/implementation docs if needed
- [ ] Add/adjust tests (unit, integration, E2E)
- [ ] Rerun local test suite
- [ ] Re-run code review after fixes
```

## Step 6: Final Checklist

Confirm each item (yes/no/needs follow-up):
- Implementation matches design & requirements
- No obvious logic or edge-case gaps
- Redundant code removed or justified
- Security considerations addressed
- Tests cover new/changed behavior
- Documentation/design notes updated
