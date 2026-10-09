---
phase: planning
title: harness-pi plan
description: Task list for I3 — reconciled post-implementation
---

# I3: harness-pi plan

- [x] pi/parser.rs: bounded head/tail fold, first-entry metadata,
      role/content extraction, status reducer, filename id fallback,
      unterminated final line
- [x] pi/locator.rs: encode_project_dir, filename timestamp,
      per-process dir discovery, birthtime/filename candidacy window,
      greedy match via shared matcher
- [x] pi/mod.rs: executable token scan, sessions.json tracker +
      trusted-path gate, registry fallback, orchestration order,
      process-only fallback, mapper
- [x] Register `PiAdapter` in `default_registry`; ported += pi;
      daemon `agent.enriched` test updated
- [x] TS capture config: `.pi/agent/sessions` dir +
      `.pi/agent/sessions.json` file; pi added to `REGISTRY_AWARE`
- [x] Synthetic bundles: `matched.json` (tracker + registry + legacy +
      process-only + non-pi skip), `fallback.json` (stale-type registry
      row, untrusted tracker path, entry-free session file)
- [x] Live bundle `live.json` captured (real pi process) — replay
      byte-identical both sides
- [x] Full verification: cargo test/clippy workspace green, agent-manager
      suite green, live daemon smoke (`ported` + real pi enrichment)
