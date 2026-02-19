# Phase 1: New Requirement

1. **Search memory** for relevant past features or conventions.
2. **Ask** for: feature name (kebab-case), problem, target users, key user stories. Skip what memory already covers; store answers after.
3. **Run shared setup first** using [worktree-setup.md](worktree-setup.md) with normalized `<name>`:
   - Default: create and use `feature-<name>` worktree
   - Optional fallback: no-worktree only when user explicitly requests it
   - Required guards: context verification + dependency bootstrap
4. **Create docs** by copying `README.md` from each `docs/ai/` subdirectory → `docs/ai/{phase}/feature-{name}.md` (requirements, design, planning, implementation, testing). Preserve frontmatter.
5. **Fill requirements doc** — problem statement, goals/non-goals, user stories, success criteria, constraints, open questions.
6. **Fill design doc** — architecture (mermaid diagram), data models, APIs, components, design decisions, security/performance.
7. **Fill planning doc** — task breakdown, dependencies, effort estimates, implementation order, risks.

**Next**: Phase 2 (Review Requirements) → Phase 3 (Review Design).
