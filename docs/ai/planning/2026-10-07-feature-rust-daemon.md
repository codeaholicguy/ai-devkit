---
phase: planning
title: ai-devkitd task plan
description: Milestones for the v1 daemon; existing branch code reconciled against this plan
---

# Planning — ai-devkitd v1

## Milestones

| # | Milestone | Deliverable | Status |
|---|---|---|---|
| M1 | Daemon core | `rust/crates/devkitd`: socket + SO_PEERCRED, SQLite sole-writer store, event log, verbs | Done (pre-plan code, reconciled) |
| M2 | Discovery + events | 2s `ps` sweep, snapshot diff, `agent.appeared/disappeared`, subscribe replay | Done (pre-plan code, reconciled) |
| M3 | Client package | `@ai-devkit/daemon-client`: line RPC client, autostart, binary resolution | Done (pre-plan code, reconciled) |
| M4 | Registry absorption | ChannelConfigRepository + pi-session-tracker daemon-first, file fallback | Done (pre-plan code, reconciled) |
| M5 | Daemon UX | `ai-devkit daemon status/start/stop/logs/install` | Done (pre-plan code, reconciled) |
| M6 | Console migration | `useAgentList` subscribes to daemon events; 60s fallback poll; no-daemon path unchanged | This run |
| M7 | Gap closure | Gap analysis vs plan; test depth to production bar; docs alignment | This run |
| M8 | Gates + PR | cargo fmt/clippy/test, nx lint+test, PR #351 updated | This run |

## Gap analysis — existing branch code vs the fresh plan

Ran the audit at plan time; each gap either closed in this milestone or recorded:

1. **Console still blind-polls** (3s interval, no daemon awareness) → closed by
   M6: `useAgentList` subscribes for invalidation, keeps fallback interval.
2. **Test depth below production bar** → closed in M7: Rust store concurrency +
   persistence, proto wire contract, golden `ps` fixtures, server end-to-end
   socket test; daemon-client autostart/fallback integration tests. These tests
   caught a real bug (stale spawn lockfile) — fixed.
3. **Autostart stale-lock wedge** → fixed (unlink by holder + 30s reclaim).
4. **Daemon `agent.list` lacks harness attribution** → by design (client-side
   knowledge); console keeps `manager.listAgents` for content, daemon supplies
   events. Documented in design; no code change.
5. **`agents.session_file` column unpopulated** → schema placeholder for the
   phase-2 knowledge port; documented, intentionally unused.
6. **Platform binary packages** (`@ai-devkit/daemon-linux-x64` etc.) → deferred
   to release workflow; resolver chain already supports them.
7. **`node`-wrapped harness processes missed by basename filter** → recorded
   limitation for the knowledge port (golden fixtures).

## Deferred (v1.5+, not in this PR)

Bridge supervision, capacity cache, task-manager store absorption, golden
fixture corpus, platform binary packages in the release pipeline, ACP revisit.
