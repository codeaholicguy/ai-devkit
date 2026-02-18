---
description: Document a code entry point in knowledge docs.
---

Guide me through creating a structured understanding of a code entry point and saving it to the knowledge docs.

1. **Gather & Validate Entry Point** — If not already provided, ask for: entry point (file, folder, function, API), why it matters (feature, bug, investigation), and desired depth or focus areas. Confirm the entry point exists; if ambiguous or not found, clarify or suggest alternatives.
2. **Collect Source Context** — Read the primary file/module and summarize purpose, exports, key patterns. For folders: list structure, highlight key modules. For functions/APIs: capture signature, parameters, return values, error handling. Extract essential snippets (avoid large dumps).
3. **Analyze Dependencies** — Build a dependency view up to depth 3, tracking visited nodes to avoid loops. Categorize: imports, function calls, services, external packages. Note external systems or generated code to exclude.
4. **Synthesize Explanation** — Draft overview (purpose, language, high-level behavior). Detail core logic, execution flow, key patterns. Highlight error handling, performance, security considerations. Identify potential improvements or risks.
5. **Create Documentation** — Normalize name to kebab-case (`calculateTotalPrice` → `calculate-total-price`). Create `docs/ai/implementation/knowledge-{name}.md` with sections: Overview, Implementation Details, Dependencies, Visual Diagrams, Additional Insights, Metadata, Next Steps. Include mermaid diagrams when they clarify flows or relationships. Add metadata (analysis date, depth, files touched).
6. **Review & Next Actions** — Summarize key insights and open questions. Suggest related areas for deeper dives. Confirm file path and remind to commit.
