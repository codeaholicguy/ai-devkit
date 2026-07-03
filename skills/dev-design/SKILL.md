---
name: dev-design
description: AI DevKit · Design phase guidance for reviewing feature design against requirements. Use when the user wants to validate architecture, review design docs, resolve design trade-offs, or run dev-lifecycle phase 3.
---

# Dev Design

Run the design review phase for configured AI docs features. Before changing docs or code, propose the concrete plan for this phase and wait for user approval unless the user already approved the exact phase plan.

## Phase Contract

1. Run `npx ai-devkit@latest lint` before phase work.
2. If working on a named feature, run `npx ai-devkit@latest lint --feature <name>`.
3. Read existing requirements and design docs before changes.
4. Ask until every material architecture, scope, validation, rollout, contradiction, trade-off, or open question is answered, explicitly deferred, or accepted as a named assumption.
5. Ask one decision at a time, with why it matters, 2-3 viable options when useful, and a recommended answer.
6. Do not approve or transition past design while material open questions remain.
7. Use mermaid diagrams for architecture visuals where a diagram clarifies the design.
8. If parent `dev-lifecycle` established usable task tracing, emit design phase, progress, blocker/open-question, and next-step events per `task`.

## Review Design

Use for Phase 3.

1. Run `npx ai-devkit@latest lint --feature <name>` and review the design doc path it validates. If manual path resolution is unavoidable, first resolve `.ai-devkit.json` `paths.docs`, falling back to `docs/ai`.
2. Search memory for relevant architecture patterns or past decisions.
3. Cross-check against the latest matching requirements doc. Verify every goal, user story, and constraint has corresponding design coverage. Flag uncovered requirements.
4. Review completeness: architecture, components, technology choices, data models, API contracts, design trade-offs, and non-functional requirements.
5. Resolve every gap, misalignment, open question, hidden assumption, or unresolved trade-off between requirements and design.
6. Brainstorm alternatives for key architecture decisions and trade-offs before accepting the first approach.
7. Update the design doc with clarified decisions and chosen options.
8. Store reusable architecture decisions in memory.
9. If task tracing is available, record design coverage progress, next step, or blockers per `task`.
10. Summarize requirements coverage, completeness assessment, updates made, and remaining gaps.

Next: `dev-implementation`. If requirements gaps are found, return to `dev-requirements`. If design is fundamentally wrong, revise design and re-review.
