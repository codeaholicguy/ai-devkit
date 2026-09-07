---
phase: design
title: Local Folder Skill Registry Design
description: Explicit file URL sources with read-only preparation and contained discovery
---

# Local Folder Skill Registry Design

## Architecture

    flowchart TD
      Input[CLI/config/template string] --> Parse[parse and normalize]
      Parse -->|non-file| Git[Git cache preparation]
      Parse -->|file URL| Local[read-only local preparation]
      Git --> Discover[bounded discovery]
      Local --> Discover
      Discover --> Install[install target]
      Discover --> Index[skills.json]
      Remove --> Owned[config/index/contained cache only]

The string map remains the storage boundary. A parser returns the local path for file URLs and null for Git sources; SkillRegistry branches preparation/update and consumers receive the actual prepared root.

## Data Model

    parseLocalRegistryPath(source): string | null

Local storage is a canonical file:///absolute/path string. No object migration or provider class is introduced.

## Parsing and Normalization

- Any file: prefix is local and validated strictly with fileURLToPath; malformed values throw.
- Every non-file persisted value is Git. Existence is never a discriminator.
- CLI shorthand is absolute, ./, or ../ and uses realpath then pathToFileURL.
- Templates use their directory as base; configs use the containing config directory.
- Hosted file URLs and unsupported Windows syntax are rejected.
- Canonical paths reject a different ID for the same folder.

## Preparation and Freshness

prepareRegistryRepository retains its per-instance promise map. Git keeps clone/pull/stale-cache behavior. Local validates its directory and skills, emits a local-source message, returns the path, calls no Git helper, and never falls back to cache. Reads remain live.

## Discovery and Containment

A shared routine canonicalizes root and skills, streams direct entries with opendir, enforces a candidate limit, validates names, canonicalizes skill and metadata paths, requires strict containment, stats metadata before a bounded read, and never recurses. Explicit install uses the same containment guard.

Production limits are documented constants based on measured repositories, with no user-facing or test-only configuration surface.

## Flow Integration

- Add-registry normalizes and validates before mutation, rejects duplicates, prepares, then indexes the returned root.
- Add/reconcile requires Git only on the Git branch.
- Find refreshes local entries every call; rebuild partitions GitHub and local sources.
- Update pulls Git caches but validates/reports local sources as live.
- Removal deletes config, index entries, and optionally only an ID-derived contained cache.
- Status formats local file URLs and preserves Git credential sanitization.
- Installed listing infers cache provenance only after containment.

## Errors and Security

Errors cover missing/non-directory/missing-skills/empty sources, escaping symlinks, duplicates, hosted file URLs, and limits. Local operations are read-only by construction; destructive APIs accept IDs only. Registry flows never execute skill content.

## Alternatives

| Option | Decision |
|---|---|
| Existing-directory detection | Reject: ambiguous and state-dependent. |
| Raw relative storage | Reject: cwd-dependent. |
| --local only | Reject: config cannot express type. |
| Object config | Defer: broad migration. |
| Provider hierarchy | Defer: no current third source. |

## Rollback

Removing the parser branch restores Git-only behavior without migrating Git users. No local data migration or source mutation exists.
