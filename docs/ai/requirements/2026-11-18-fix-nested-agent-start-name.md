---
phase: requirements
title: Fix nested agent start losing assigned name (#402)
description: Requirements for split-brain identity when HOME diverges from the account home
---

# Requirements — fix nested agent start name (#402)

## Problem

`agent start` from a sandboxed/nested context can report success with `--name`, while `agent list` and `agent send --id` only see a synthesized `{cwd-folder}-{pid}` identity.

## Acceptance criteria

- Nested/sandboxed `agent start` either succeeds with the assigned name visible to list/send (via daemon `agent.start`), or fails loudly with a divergent-environment diagnostic — never silent fallback.
- No false success on the local fallback path when the registry write cannot round-trip.
- `ensureDaemon` must not auto-spawn devkitd from a divergent HOME.
- Synthesized identities are visibly marked `unregistered:<folder>-<pid>` when no registry entry claims them.