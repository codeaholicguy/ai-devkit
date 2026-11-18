---
phase: design
title: Filesystem-first registry source normalization (#419)
---

# Design — #419

## Root cause

`normalizeRegistrySourceInput` previously classified local vs git by string shape only. Bare `.` and plain relative names (e.g. `skills`) did not match path shorthands, so `cacheRegistry` called `prepareGitRegistry` → `git clone` on a local directory.

## Approach

1. After `file:` and git URL scheme checks, resolve scheme-less values with `path.resolve(baseDir, value)`.
2. When the resolved path exists and is a directory, return `pathToFileURL(realpath)` for storage.
3. `prepareRegistryRepository` branches on `parseLocalRegistryPath(value) !== null` to call `prepareLocalRegistry` (no git, no cache write).

## Config

`ConfigManager.getSkillRegistries` normalizes with `path.dirname(configPath)` as `baseDir`, so legacy relative entries still resolve to the project root on read.