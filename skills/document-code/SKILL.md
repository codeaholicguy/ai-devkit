---
name: document-code
description: AI DevKit · Document a code entry point with structured analysis, dependency mapping, and saved knowledge docs. Use when users ask to document, understand, or map code for a module, file, folder, function, or API.
---

# Code Documentation Assistant

Build structured understanding of code entry points with an analysis-first workflow.

## Hard Rule
- Do not create documentation until the entry point is validated and analysis is complete.

## Workflow

1. Gather & Validate
- Confirm entry point (file, folder, function, API), purpose, and desired depth.
- Verify it exists; resolve ambiguity or suggest alternatives if not found.
- Search for existing knowledge before analyzing: `npx ai-devkit@latest memory search --query "<entry point name or purpose>"`

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
- Create `docs/ai/implementation/knowledge-{name}.md` using the Output Template — this is the source of truth.
- Include mermaid diagrams when they clarify flows or relationships.

6. Offer HTML Artifact
- After the markdown is written, ask the user once: "Also generate an HTML artifact for easier scanning? (y/N)".
- If yes, generate sibling `docs/ai/implementation/knowledge-{name}.html` per the HTML Artifact spec. Regenerate from the markdown on subsequent runs; never hand-edit.
- If no or no response, stop here — markdown alone is a complete result.

## HTML Artifact

Generated only when the user opts in at step 6. A self-contained HTML file optimized for scanning, not reference reading. Complements the markdown — does not replace it.

Constraints:
- Single file. Inline CSS. No build step. Only external asset allowed is mermaid via CDN (`https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js`).
- Card-based grid layout, not a long scroll. The reader should capture structure at a glance.
- Responsive down to laptop width. Print-friendly.
- No interactivity beyond collapsible deep-dives and mermaid pan/zoom.

Section mapping (from the Output Template):
- Overview → hero card: title, one-line purpose, language/type badges.
- Implementation Details → grid of sectioned cards with short bullets, not prose.
- Dependencies → graph card (mermaid) plus a categorized list (imports, calls, services, external).
- Visual Diagrams → full-width rendered mermaid blocks.
- Additional Insights → callout boxes, color-coded by kind (info, warning, risk).
- Next Steps → checklist card.
- Metadata → compact footer (date, depth, files touched).

## Red Flags and Rationalizations

| Rationalization | Why It's Wrong | Do Instead |
|---|---|---|
| "I already understand this code" | Understanding ≠ documented understanding | Write it down, then verify |
| "The code is self-documenting" | Future readers lack your current context | Capture the why, not just the what |
| "Dependencies are obvious" | Implicit dependencies cause surprises | Map them explicitly to depth 3 |

## Validation
- Documentation covers all Output Template sections.
- If an HTML artifact was generated, it opens standalone in a browser, renders mermaid, and reflects the markdown content (no drift).
- Summarize key insights, open questions, and related areas for deeper dives.
- Confirm file path(s) and remind to commit.

## Output Template
- Overview
- Implementation Details
- Dependencies
- Visual Diagrams (mermaid)
- Additional Insights
- Metadata (date, depth, files touched)
- Next Steps
