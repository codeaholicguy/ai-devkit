---
phase: design
title: Tmux Setup Prerequisite Design
description: Pure inspection and shared platform guidance for setup and agent start
---

# Tmux Setup Prerequisite Design

```mermaid
flowchart LR
  Setup[setup command] --> Inspect[inspectTmux]
  Inspect --> Run[injected tmux -V runner]
  Setup --> Guide[platform instruction resolver]
  Start[agent start guard] --> Guide
  Guide --> OS[injected platform and host readers]
```

`util/tmux.ts` owns a discriminated inspection result and fixed guidance recipes. Environment access is assembled by `createTmuxInspectionDeps`; tests inject every boundary. Setup checks once after option validation and before its service. Agent start resolves the same guidance only after `TmuxUnavailableError`.

`parseOsRelease` normalizes `ID` and `ID_LIKE` as data. No host-controlled value is interpolated into commands. `ENOENT` means missing; other failures remain distinct. Unknown systems fall back, while Nix, BSD, and native Windows are explicit punts and WSL is labeled as distro-local.
