---
description: Perform a local code review before pushing changes, ensuring alignment with design docs and best practices.
---

# Local Code Review Assistant

You are helping me perform a local code review **before** I push changes. Please follow this structured workflow.

## Step 1: Gather Context
Ask me for:
- Brief feature/branch description
- List of modified files (with optional summaries)
- Relevant design doc(s) (e.g., `docs/ai/design/feature-{name}.md` or project-level design)
- Any known constraints or risky areas
- Any open bugs or TODOs linked to this work
- Which tests have already been run

If possible, request the latest diff:
```bash
git status -sb
git diff --stat
```

## Step 2: Understand Design Alignment
For each provided design doc:
- Summarize the architectural intent
- Note critical requirements, patterns, or constraints the design mandates

## Step 3: File-by-File Review
For every modified file:
1. Highlight deviations from the referenced design or requirements
2. Spot potential logic or flow issues and edge cases
3. Identify redundant or duplicate code
4. Suggest simplifications or refactors (prefer clarity over cleverness)
5. Flag security concerns (input validation, secrets, auth, data handling)
6. Check for performance pitfalls or scalability risks
7. Ensure error handling, logging, and observability are appropriate
8. Note any missing comments or docs
9. Flag missing or outdated tests related to this file

## Step 4: Cross-Cutting Concerns
- Verify naming consistency and adherence to project conventions
- Confirm documentation/comments are updated where the behavior changed
- Identify missing tests (unit, integration, E2E) needed to cover the changes
- Ensure configuration/migration updates are captured if applicable

## Step 5: Summarize Findings
Provide results in this structure:
```
### Summary
- Blocking issues: [count]
- Important follow-ups: [count]
- Nice-to-have improvements: [count]

### Detailed Notes
1. **[File or Component]**
   - Issue/Observation: ...
   - Impact: (e.g., blocking / important / nice-to-have)
   - Recommendation: ...
   - Design reference: [...]

2. ... (repeat per finding)

### Recommended Next Steps
- [ ] Address blocking issues
- [ ] Update design/implementation docs if needed
- [ ] Add/adjust tests:
      - Unit:
      - Integration:
      - E2E:
- [ ] Rerun local test suite
- [ ] Re-run code review command after fixes
```

## Step 6: Final Checklist
Confirm whether each item is complete (yes/no/needs follow-up):
- Implementation matches design & requirements
- No obvious logic or edge-case gaps remain
- Redundant code removed or justified
- Security considerations addressed
- Tests cover new/changed behavior
- Documentation/design notes updated

---
Let me know when you're ready to begin the review.
