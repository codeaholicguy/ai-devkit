---
phase: planning
title: harness-codex plan
description: Task list for I2 — reconciled post-implementation
---

# I2: harness-codex plan

- [x] shared.rs: birthtime_ms, local_day_key, is_idle, truncate,
      parse_timestamp_ms, fold_jsonl_bounded, read_file_head
- [x] codex/parser.rs: summary reducer + status mapping
- [x] codex/locator.rs: resume + uuidv7 + session_meta + legacy + neg-cache
- [x] codex/mod.rs: helper-subcommand filter, mapping file, registry cache,
      orchestration, mapper
- [x] Synthetic bundles (mapping + resume + legacy + statuses + helper-skip)
- [x] Rust + TS parity green; register adapter; ported += codex
