---
name: changelog
description: AI DevKit · Update CHANGELOG.md Unreleased items from git commits since the latest release. Use when users ask to update changelog/release notes from recent commits, with one concise line per commit and commit/PR links.
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
