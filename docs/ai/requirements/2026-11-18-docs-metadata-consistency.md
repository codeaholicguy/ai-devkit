---
phase: requirements
title: Docs and metadata consistency
---

# Docs and metadata consistency

## Problem Statement

User-facing taglines, Node.js version requirements, and the Kiro support matrix in the README do not match published `package.json` metadata and CLI behavior.

## Goals

- Use one product tagline everywhere it serves as a short description.
- Align documented Node.js minimum with `packages/cli/package.json` `engines.node` (`>=22.0.0`).
- Correct Kiro rows in the README support matrix to match `init`/`setup` and agent-manager behavior.

## Scope

Docs and metadata only; no runtime or CLI behavior changes.

## Success Criteria

- Listed tagline slots updated; intentional non-changes documented.
- User-facing Node 20.20 mentions in README site docs replaced with Node 22+.
- README Kiro `init` column reflects that Kiro is not an `EnvironmentCode` for project install.
- Lint, site build (if applicable), and metadata-related tests pass.