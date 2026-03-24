# Phase 3: Review Design

Review `docs/ai/design/feature-{name}.md` for completeness and fit against requirements.

1. **Search memory** for relevant architecture patterns or past decisions.
2. **Cross-check against requirements** — read `docs/ai/requirements/feature-{name}.md` and verify every goal, user story, and constraint has corresponding design coverage. Flag uncovered requirements.
3. **Review completeness** — architecture (mermaid diagram), components, technology choices, data models, API contracts, design trade-offs, non-functional requirements.
4. **Clarify and explore (loop until converged)**:
   - **Ask clarification questions** for every gap or misalignment between requirements and design. Do not just list issues — actively ask specific questions. Example: "Requirements mention offline support but design has no caching — should we add one?"
   - **Brainstorm and explore options** — For key architecture decisions, trade-offs, or areas with multiple viable approaches, proactively brainstorm alternatives. Present options with pros/cons and trade-offs. Don't just accept the first approach — challenge assumptions and surface creative alternatives.
   - **Repeat** — Clarifying answers may reveal new trade-offs worth exploring, and brainstorming may surface new questions. Continue looping until the user is satisfied with the chosen approach and no open questions remain.
5. **Update** the design doc with clarified decisions and chosen options.
6. **Store** clarified architecture decisions in memory.
7. **Summarize** requirements coverage, completeness assessment, updates made, remaining gaps.

**Next**: Phase 4 (Execute Plan). If requirements gaps found → back to Phase 2. If design fundamentally wrong → revise design and re-review.
