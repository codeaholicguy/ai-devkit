---
phase: requirements
title: Requirements & Problem Understanding
description: Deterministic feature-document initialization command
---

# Requirements & Problem Understanding

## Problem Statement
AI DevKit's `/new-requirement` workflow currently asks the agent to create feature documentation files directly. A date-prefixed filename convention improves chronological ordering, but prompt-only instructions cannot guarantee that the date prefix is today's date or that every phase receives the same filename pattern.

This affects developers who use AI DevKit skills to start feature work. If agents choose stale dates, UTC dates near midnight, inconsistent filenames, or legacy names, follow-up commands and lint checks become harder to trust.

## Goals & Objectives
- Add a deterministic CLI command that initializes all feature docs for a feature name.
- Generate filenames with the current local calendar date in `YYYY-MM-DD` format.
- Keep the agent responsible for gathering and writing content, not choosing filesystem conventions.
- Preserve compatibility with existing `feature-{name}.md` docs.
- Update lifecycle command guidance to run the new command for new features.

Non-goals:
- Automatically migrate or rename existing feature docs.
- Remove legacy filename support.
- Add a full document management subsystem beyond feature-doc initialization.
- Require users to adopt date-prefixed filenames immediately.

## User Stories & Use Cases
- As a developer, I want to run `ai-devkit docs init-feature user-authentication` so that all phase docs are created with a consistent current-date prefix.
- As an agent using `/new-requirement`, I want to run one deterministic command and then fill returned paths so that I do not invent filenames.
- As a maintainer, I want lint to accept old and new conventions so that existing projects continue working.
- As a tester or release author, I want deterministic tests around the current-date behavior so generated filenames stay predictable.

Key workflows:
- New feature: agent gathers feature name, runs `npx ai-devkit@latest docs init-feature <name>`, reads output paths, fills docs.
- Existing feature: follow-up commands locate the newest `YYYY-MM-DD-feature-{name}.md`, falling back to `feature-{name}.md`.
- Automation: caller can pass `--json` to receive machine-readable generated paths.

## Success Criteria
- `ai-devkit docs init-feature <name>` creates requirements, design, planning, implementation, and testing docs.
- Generated docs are copied from the corresponding phase `README.md` templates and preserve frontmatter.
- Generated filenames use local date format `YYYY-MM-DD-feature-{name}.md`.
- Invalid feature names fail with a clear message using existing feature-name validation rules.
- Existing target files are not overwritten by default.
- Existing target conflicts are detected before writing any files, so the command does not partially initialize a feature.
- The command inherits the configured docs dir and does not expose a docs-dir override.
- The command supports `--json` output for agents and scripts.
- Lint accepts both date-prefixed and legacy feature docs.
- Command templates and lifecycle references instruct agents to run the CLI initializer for new docs.
- Unit tests cover date generation, duplicate-file behavior, configured docs dir, invalid names, and command registration.

## Constraints & Assumptions
- The CLI is TypeScript and uses Commander for command registration.
- `TemplateManager` already owns phase template copying behavior and should be extended rather than duplicated.
- Local date is preferred over UTC date to match the user's working day.
- The current repository has existing legacy docs, so compatibility must remain.
- Static installed skills can drift from CLI versions; command guidance should include a fallback for older CLI versions where practical.

## Questions & Open Items
- Resolved: normal use relies on current local date; no date flag is exposed.
- Resolved: include `--json` in the first implementation so agents can consume exact generated paths reliably.
- Resolved: duplicate existing files fail all-or-nothing before writing any new files.
- Resolved: public command name is `docs init-feature`.
