---
name: changelog
description: AI DevKit · Update CHANGELOG.md Unreleased items from git commits since the latest release, or write the Change Log section of a per-feature report at the end of dev-lifecycle. Use when users ask to update changelog/release notes from recent commits, or when dev-lifecycle finishes a feature.
---

# Changelog

Update the top `Unreleased` list in `CHANGELOG.md` from commits after the latest release.

## Workflow

1. Find the latest release base:
   - Prefer the latest reachable tag: `git describe --tags --abbrev=0`.
   - If there are no tags, search recent history for a release commit and use that hash.
2. Get commits: `git log <base>..HEAD --reverse --format='%H%x09%s'`.
3. Derive the GitHub repo URL from `git remote get-url origin`.
4. For each commit, add one concise changelog line:
   - Format: `- [<short-hash>](<url>) <one-line summary>`
   - If the commit clearly relates to a PR, link the hash to the PR URL instead of the commit URL.
   - Detect PRs from subjects like `(#123)`, merge commits, or `gh pr list --search <hash> --state all --json number,url`.
5. Insert the new lines into the top `Unreleased` section/list in `CHANGELOG.md`.
   - If no `Unreleased` section exists, create one at the top.
   - Do not create a dated release heading unless the user asks for a release.

## Rules

- Keep one line per commit.
- Preserve the existing changelog style when obvious.
- Always add entries to the top `Unreleased` list.
- Skip noisy commits only when clearly non-user-facing and explain what was skipped.
- Do not invent PR links; use commit links when PR evidence is missing.

## Feature Report Mode

Used automatically by `dev-lifecycle` Phase 10 (or when the user asks for a feature report). Writes the change log into a per-feature report instead of `CHANGELOG.md`.

Inputs: feature `<name>` and its date prefix `<date>` (`YYYY-MM-DD`), taken from the existing feature docs file names `<date>-feature-<name>.md`. Never generate a new date for an existing feature; use today's date only if no docs exist yet.

1. Resolve the docs directory from `npx ai-devkit@latest lint --feature <name>` (fallback `.ai-devkit.json` `paths.docs`, then `docs/ai`).
2. Report path: `<docs>/report/<date>-feature-<name>.md`. Create the `report/` directory if missing.
3. If the file does not exist, create it from `templates/report.md` in this skill directory, filling `{{...}}` placeholders from the feature docs and review/test evidence. Do not leave placeholders unfilled; write `n/a` when unknown.
4. Commit range: the merge-base of the feature branch and the default branch to `HEAD`: `git log $(git merge-base HEAD <default-branch>)..HEAD --reverse --format='%H%x09%s'`. Add lines using the same format and PR-link rules as the standard workflow.
5. Replace only the content between `<!-- changelog:start ... -->` and `<!-- changelog:end -->`. Rerunning must be idempotent: regenerate the block, never append duplicates, never touch text outside the markers.
6. Set `Completed` to today's date; keep `date` in the frontmatter and title unchanged.
7. Report the path written and the number of entries. If there are zero commits, say so instead of writing an empty list.

Feature Report Mode never edits `CHANGELOG.md`; use the standard workflow for that.

## HTML Views (for humans)

Markdown docs are for agents. Humans read HTML. Every Feature Report run also renders HTML views; the `.md` files stay the single source of truth and HTML is always regenerated from them, never edited.

Layout: each docs phase folder gets an `html/` subfolder next to the existing `.md` files, same base name:

```
<docs>/requirements/<date>-feature-<name>.md        <- agent
<docs>/requirements/html/<date>-feature-<name>.html <- human
(same for design, planning, implementation, testing, report)
```

Keep the `.md` files where they are: `ai-devkit lint`, `docs init-feature` and `dev-lifecycle/scripts/check-status.sh` look for them at those paths. Do not move them into an `md/` folder without updating the CLI.

Steps (after the report `.md` is written):

1. For each phase doc of the feature, render `<phase>/html/<date>-feature-<name>.html`. Start from `templates/report.html` for the report page; for phase pages reuse its `<style>`, header and diagram script and convert the markdown body to HTML. Files are self-contained (inline CSS/JS, no build step, no dependencies).
2. Add a `<nav>` linking the sibling phase pages with relative links.
3. Modeling: draw diagrams as Mermaid `<pre class="mermaid">` blocks, only ones that reflect what the docs and code actually say:
   - requirements page: user flow or scope map (in/out of scope).
   - design page: architecture/component diagram, plus a sequence diagram for the main flow and an ER diagram if data models change.
   - planning page: task dependency graph and progress bar from checkbox counts.
   - report page: end-to-end summary flow and the change-log table.
   Do not invent components, tables or flows not present in the docs. Skip a diagram type when the docs give no basis.
4. Change-log table rows use the same commits as the markdown block; replace only between the `changelog:start/end` markers on rerun.
5. Escape HTML in all text taken from docs and commit messages.
6. Final summary tells the user the path of `report/html/<date>-feature-<name>.html` as the entry point for reading.
