---
phase: requirements
title: Tmux Setup Prerequisite Requirements
description: Surface tmux before the first managed interactive agent start
---

# Tmux Setup Prerequisite Requirements

## Problem and Goals

Users currently discover the tmux dependency only when an interactive managed agent fails to start. Setup should check `tmux -V` once before agent wiring, report the version in a separate host-prerequisites block, warn with platform-aware manual guidance when missing, continue setup, and reuse the guidance at runtime.

## Non-goals

- No package installation, prompt, install flag, version rejection, doctor command, or checks in `init`/`install`.
- Native Windows and BSD interactive-agent support remain out of scope; WSL receives Linux-distro guidance.

## Acceptance Criteria

- Available, missing, and execution-error states are distinct and tested with mocks.
- Mainstream Linux families and macOS receive fixed copy-paste commands; unknown and explicitly punted hosts receive honest fallbacks.
- Missing or broken tmux never changes setup's exit status.
- The provisional tmux 2.6+ floor appears only in documentation.

All scope decisions were approved in `/tmp/tmux-setup-impl-brief.md`; no open product questions remain.
