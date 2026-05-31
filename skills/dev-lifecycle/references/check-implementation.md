# Phase 6: Check Implementation

Compare implementation against the latest matching `docs/ai/{design,requirements}/YYYY-MM-DD-feature-{name}.md` docs. If none exist, use legacy `feature-{name}.md` docs.

1. **Gather context** — feature description, modified files, relevant design/requirements docs, constraints.
2. **Summarize design** — key decisions, components, interfaces, data flows.
3. **File-by-file comparison** — verify design intent, note deviations, flag logic gaps/edge cases/security issues, identify missing tests or doc updates.
4. **Finalize the implementation doc** — kept current in Phase 4; here, verify it captures what shipped, fill gaps from step 3, record follow-ups. A future reader should understand the feature from this doc alone.
5. **Summarize** alignment status, deviations (with severity), missing pieces, concerns, next steps.

**Next**: Phase 7 (Write Tests) → Phase 8 (Code Review). If major deviations → back to Phase 3 (design wrong) or Phase 4 (implementation wrong).
