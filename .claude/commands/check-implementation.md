Compare the current implementation with the design in docs/ai/design/ and requirements in docs/ai/requirements/. Please follow this structured review:

## Memory (use when helpful)
- If you need clarification or project conventions, query `memory.searchKnowledge` with a brief task description, tags, and scope.
- If I ask to save reusable guidance, run `/remember` (or call `memory.storeKnowledge`).
- If MCP tools are unavailable, use `ai-devkit memory search` or `ai-devkit memory store`.

1. Ask me for:
   - Feature/branch description
   - List of modified files
   - Relevant design doc(s) (feature-specific and/or project-level)
   - Any known constraints or assumptions

2. For each design doc:
   - Summarize key architectural decisions and constraints
   - Highlight components, interfaces, and data flows that must be respected

3. File-by-file comparison:
   - Confirm implementation matches design intent
   - Note deviations or missing pieces
   - Flag logic gaps, edge cases, or security issues
   - Suggest simplifications or refactors
   - Identify missing tests or documentation updates

4. Summarize findings with recommended next steps.

