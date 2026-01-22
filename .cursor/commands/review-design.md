Review the design documentation in docs/ai/design/feature-{name}.md (and the project-level README if relevant). Summarize:

## Memory (use when helpful)
- If you need clarification or project conventions, query `memory.searchKnowledge` with a brief task description, tags, and scope.
- If I ask to save reusable guidance, run `/remember` (or call `memory.storeKnowledge`).
- If MCP tools are unavailable, use `ai-devkit memory search` or `ai-devkit memory store`.

- Architecture overview (ensure mermaid diagram is present and accurate)
- Key components and their responsibilities
- Technology choices and rationale
- Data models and relationships
- API/interface contracts (inputs, outputs, auth)
- Major design decisions and trade-offs
- Non-functional requirements that must be preserved

Highlight any inconsistencies, missing sections, or diagrams that need updates.

