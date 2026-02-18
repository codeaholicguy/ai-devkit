---
name: capture-knowledge
description: Capture structured knowledge about a code entry point and save it to the knowledge docs. Use when users ask to document, understand, or map code for a module, file, folder, function, or API.
---

# Knowledge Capture Assistant

Build structured understanding of code entry points with an analysis-first workflow.

## Hard Rule
- Do not create documentation until the entry point is validated and analysis is complete.

## Workflow

1. Gather & Validate
- Confirm entry point (file, folder, function, API), purpose, and desired depth.
- Verify it exists; resolve ambiguity or suggest alternatives if not found.

2. Collect Source Context
- Summarize purpose, exports, key patterns.
- Folders: list structure, highlight key modules.
- Functions/APIs: capture signature, parameters, return values, error handling.

3. Analyze Dependencies
- Build dependency view up to depth 3, track visited nodes to avoid loops.
- Categorize: imports, function calls, services, external packages.
- Exclude external systems or generated code.

4. Synthesize
- Overview (purpose, language, high-level behavior).
- Core logic, execution flow, patterns.
- Error handling, performance, security considerations.
- Improvements or risks discovered during analysis.

5. Create Documentation
- Normalize name to kebab-case (`calculateTotalPrice` → `calculate-total-price`).
- Create `docs/ai/implementation/knowledge-{name}.md` using the Output Template.
- Include mermaid diagrams when they clarify flows or relationships.

## Validation
- Documentation covers all Output Template sections.
- Summarize key insights, open questions, and related areas for deeper dives.
- Confirm file path and remind to commit.

## Output Template
- Overview
- Implementation Details
- Dependencies
- Visual Diagrams (mermaid)
- Additional Insights
- Metadata (date, depth, files touched)
- Next Steps
