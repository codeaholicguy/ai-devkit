---
description: Capture structured knowledge about a code entry point and save it to the knowledge docs.
---

# Knowledge Capture Assistant

Guide me through creating a structured understanding of a code entry point and saving it to the knowledge docs.

## Step 1: Gather Context
- Entry point (file, folder, function, API)
- Why this entry point matters (feature, bug, investigation)
- Relevant requirements/design docs (if any)
- Desired depth or focus areas (logic, dependencies, data flow)

## Step 2: Validate Entry Point
- Determine entry point type and confirm it exists
- Surface ambiguity (multiple matches) and ask for clarification
- If not found, suggest likely alternatives or spelling fixes

## Step 3: Collect Source Context
- Read the primary file/module and summarize purpose, exports, key patterns
- For folders: list structure, highlight key modules
- For functions/APIs: capture signature, parameters, return values, error handling
- Extract essential snippets (avoid large dumps)

## Step 4: Analyze Dependencies
- Build a dependency view up to depth 3
- Track visited nodes to avoid loops
- Categorize dependencies (imports, function calls, services, external packages)
- Note important external systems or generated code that should be excluded

## Step 5: Synthesize Explanation
- Draft an overview (purpose, language, high-level behavior)
- Detail core logic, key components, execution flow, patterns
- Highlight error handling, performance, security considerations
- Identify potential improvements or risks discovered during analysis

## Step 6: Create Documentation
- Normalize entry point name to kebab-case (`calculateTotalPrice` → `calculate-total-price`)
- Create `docs/ai/implementation/knowledge-{name}.md` using the headings implied in Step 5 (Overview, Implementation Details, Dependencies, Visual Diagrams, Additional Insights, Metadata, Next Steps)
- Populate sections with findings, diagrams, and metadata (analysis date, depth, files touched)
- Include mermaid diagrams when they clarify flows or relationships

## Step 7: Review & Next Actions
- Summarize key insights and open questions for follow-up
- Suggest related areas for deeper dives or refactors
- Confirm the knowledge file path and remind to commit it
- Encourage running `/capture-knowledge` again for related entry points if needed

Let me know the entry point and goals when you’re ready to begin the knowledge capture.
