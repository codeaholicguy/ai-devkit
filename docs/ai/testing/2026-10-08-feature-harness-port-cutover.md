---
phase: testing
title: harness-port-cutover test report
description: Coverage and results for the I12 cutover
---

# I12: cutover — testing

## Coverage

- Consumer audit: all `new AgentManager` sites —
  `commands/agent.ts` (had `fetchEnrichedAgents`), console (receives
  that manager), `channel-runner.ts` (wired in this iteration).
- `agent list --json` run twice on the live machine — once with
  `AI_DEVKIT_NO_DAEMON=1` (pure local) and once with the daemon up.
  Same type set (`claude`, `codex`, `devin`, `pi` + durable rows);
  count differs only because processes churn between the two calls.
- `status` command exercised in both modes — daemon-primary and
  daemon-down fallback produce identical output.
- Latency measurement: warm `enrichedAgents` RPC 0.4ms vs local
  `listAgents` 238ms; daemon sweep cost moved off the call path.

## Results

- `cargo test --workspace`: 82 tests green; clippy `-D warnings`.
- `vitest` agent-manager: 1345 passed | cli: 1320 passed (1 known
  unrelated TUI timing flake, passes standalone).
- devkitd live smoke: `agent.enriched` 18 agents, `ported` all ten,
  `agent.readiness` 10 reports.

## Epic status after I12

All milestones I0–I12 complete. The daemon owns discovery, enrichment,
event history, and readiness; TS adapters persist only as the
documented fallback.
