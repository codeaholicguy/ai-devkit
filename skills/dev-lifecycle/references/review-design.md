# Phase 3: Review Design

Review design using the latest matching `docs/ai/design/YYYY-MM-DD-feature-{name}.md`. If none exists, use `docs/ai/design/feature-{name}.md`. Check completeness and fit against requirements.

1. **Search memory** for relevant architecture patterns or past decisions.
2. **Cross-check against requirements** — read the latest matching `docs/ai/requirements/YYYY-MM-DD-feature-{name}.md`; if none exists, use `docs/ai/requirements/feature-{name}.md`. Verify every goal, user story, and constraint has corresponding design coverage. Flag uncovered requirements.
3. **Review completeness** — architecture (mermaid diagram), components, technology choices, data models, API contracts, design trade-offs, non-functional requirements.
4. **Clarify and explore** using the Early-Phase Clarification Contract:
   - Resolve every gap, misalignment, open question, hidden assumption, or unresolved trade-off between requirements and design. Example: "Requirements mention offline support but design has no caching — should we add one?"
   - Brainstorm alternatives for key architecture decisions and trade-offs; challenge assumptions before accepting the first approach.
5. **Update** the design doc with clarified decisions and chosen options.
6. **Store** clarified architecture decisions in memory.
7. **Summarize** requirements coverage, completeness assessment, updates made, remaining gaps.

**Next**: Phase 4 (Execute Plan). If requirements gaps found → back to Phase 2. If design fundamentally wrong → revise design and re-review.
