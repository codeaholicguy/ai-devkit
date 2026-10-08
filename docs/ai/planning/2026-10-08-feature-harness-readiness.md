---
phase: planning
title: harness-readiness plan
description: Task list for I11 — reconciled post-implementation
---

# I11: readiness — plan

- [x] `readiness/checks.rs` — runtime struct, `display_home`,
      `worst_status`, `record`/`non_empty`, `accessible`, executable /
      directory / builtInSkills / script / registration / mapping
      checks
- [x] `readiness/codex_auth.rs` — auth.json → `Option<bool>`
      (personal_access_token non-empty, or tokens.access_token +
      account_id non-stale via expires_at/expiresAt/expiry/JWT exp)
- [x] `readiness/profiles.rs` — per-harness auth/integration probes
      (claude, codex, copilot, devin, opencode, pi) + configDir table
- [x] `readiness/mod.rs` — `Host` trait, `SystemHost` (libc access +
      timed Command), `readiness_report(s)` in AGENT_TYPES order
- [x] Wire types in `devkit-core` (+ ts-rs export, .js import fix);
      `agent.readiness` method in devkitd (params: homeDir/path/
      assetRoot/builtInSkillNames/skillRoots)
- [x] `DaemonClient.agentReadiness`; status.service daemon-primary
      when no injectable seams; fallback on failure
- [x] `fixtures/readiness/` bundles + TS replay + Rust parity test
- [x] `regex` workspace dep for probe patterns
- [x] Verification: workspace tests, clippy -D warnings,
      agent-manager + cli suites, live `agent.readiness` smoke,
      `status` command smoke (daemon-primary + daemon-down fallback)
