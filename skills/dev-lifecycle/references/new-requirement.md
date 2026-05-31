# Phase 1: New Requirement

1. **Search AI DevKit memory** (not built-in memory) for relevant past features or conventions via `npx ai-devkit@latest memory search --query "<feature/topic>"`. If unfamiliar, check the AI DevKit memory skill first.
2. **Clarify before setup or docs** using the Early-Phase Clarification Contract:
   - Cover feature name (kebab-case), problem, target users, key user stories, scope, non-goals, success criteria, UX, constraints, rollout, and validation.
   - Skip only facts already covered by memory or existing docs.
   - Brainstorm alternatives to confirm this is the right thing to build; present 2-3 approaches with one-line trade-offs and a recommendation.
   - Store reusable answers after clarification.
3. **Run shared setup first** using [worktree-setup.md](worktree-setup.md) with normalized `<name>`:
   - Default: create and use `feature-<name>` worktree
   - Optional fallback: no-worktree only when user explicitly requests it
   - Required guards: context verification + dependency bootstrap
4. **Initialize docs** by running `npx ai-devkit@latest docs init-feature <name>` from the active worktree/repository and filling the returned paths. It uses configured phases. If unavailable, copy each configured phase `README.md` to `docs/ai/{phase}/feature-{name}.md`, preserving frontmatter.
5. **Fill requirements doc** — problem statement, goals/non-goals, user stories, success criteria, constraints, open questions.
6. **Fill design doc** — architecture (mermaid diagram), data models, APIs, components, design decisions, security/performance.
7. **Fill testing doc** — derive the test plan from requirements' success criteria + design's components/edge cases. List scenarios (happy path, edges, errors, integration boundaries) as `- [ ]` checkboxes, plus mocks/fixtures and coverage target. Do this before planning so gaps surface as new tasks. Updated continuously in Phase 4.
8. **Fill planning doc** — tasks, dependencies, estimates, order, risks. Verify every test-plan scenario has an implementation task.

**Next**: Phase 2 (Review Requirements) → Phase 3 (Review Design).
