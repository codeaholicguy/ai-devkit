---
phase: requirements
title: harness-readiness requirements
description: Port the readiness shared library into devkit-harness (I11)
---

# I11: readiness — shared lib

Port `harnesses/readiness/` (checks.ts + AgentReadiness.ts + types.ts,
~515 LOC) plus the six per-harness profile probes (claude, codex,
copilot, devin, opencode, pi; ~360 LOC) into
`rust/crates/devkit-harness/src/readiness/`, served by the daemon via
`agent.readiness` so `status` consumes readiness without duplicating
the checks locally.

## In scope

- `executableCheck`: resolve `HARNESS_RUNTIME_PROFILES[type].command`
  against runtime `path` (PATH delimiter split, empty segments
  skipped), X_OK `access` per candidate in order, first hit wins;
  fail + `${command} was not found on PATH` otherwise
- `directoryCheck`: `access` home-joined `profile.configDir` R_OK;
  path displayed `~`-collapsed via `displayHome`; missing → fail +
  "global configuration directory is unavailable"
- `builtInSkillsCheck`: `skillRoots[type]` absent →
  `{path: null, required: n, present: 0, missing: all, info}`; else
  R_OK check `<root>/<name>/SKILL.md` per required name, preserving
  declared order for `missing`; always `info`
- `scriptCheck`: installed vs bundled byte equality; unreadable
  installed → fail "hook script is unavailable"; unreadable bundled →
  fail "bundled hook asset is unavailable"; differs → fail "hook
  script differs from the bundled AI DevKit asset"
- `registrationCheck`: JSON `hooks[event][*].hooks[*]` with
  `{type: "command", command}` match; missing/invalid file → fail
  "hook configuration is missing or invalid"; no match → fail
  "required hook registration is missing"
- `mappingCheck`: missing file → warn "session mapping has not been
  created"; malformed JSON/non-object → fail "session mapping is
  invalid"; non-`/^\d+$/` pid keys or non-string/empty sessionPath
  values → `invalidEntries`; unreadable sessionPath → `staleEntries`;
  invalid>0 → fail "session mapping contains invalid entries";
  stale>0 → warn "session mapping contains stale entries"
- `worstReadinessStatus`: fail > warn > pass
- `displayHome`: `== home` → `~`; `startsWith(home + "/")` → `~` +
  suffix; else unchanged
- Profiles: claude (`.claude`; `claude auth status --json` JSON
  loggedIn/authenticated; integration = scriptCheck `hooks/
  claude-prompt-hook.js` vs `assetRoot/claude/...` + registrationCheck
  `settings.json` PreToolUse `node ~/.claude/hooks/claude-prompt-hook.js`),
  codex (`.codex`; codexAuth probe; integration = scriptCheck
  `codex-session-mapping.cjs` + registrationCheck `hooks.json`
  SessionStart + mappingCheck `ai-devkit/sessions.json`; installed =
  script && registration pass only),
  copilot (`.copilot`; `gh auth status --hostname github.com` success
  → authenticated else warn/unknown),
  devin (`.config/devin`; `devin auth status` stdout `^Logged in`m),
  opencode (`.config/opencode`; `opencode auth list` bullet-line
  provider names after ANSI strip + suffix trim + "N credentials"
  exclusion),
  pi (`.pi`; `~/.pi/agent/auth.json` provider-names —
  `provider` string + `providers` object keys + other object-valued
  top-level keys, sorted; integration = `pi list` session-tracker name
  + mappingCheck `agent/sessions.json`, mappingStatus =
  valid||!present ? pass : fail)
- ConfigDir-only: gemini_cli `.gemini`, grok_cli `.grok`, kiro `.kiro`,
  antigravity_cli `.gemini/antigravity-cli`
- Command probes: 5s timeout, non-zero exit → error path, like
  `execFile`
- Daemon `codexAuth` equivalent: file-based — `CODEX_HOME`/`~/.codex/
  auth.json` parses and yields a non-stale credential → `Some(true)`;
  parses but no valid credential → `Some(false)`; missing/malformed →
  `None` (no network/app-server probe; documented divergence)
- Wire: `agent.readiness` params `{homeDir?, path?, assetRoot?,
  builtInSkillNames?, skillRoots?}` → `{reports:
  [AgentReadinessReport...]}` ordered per AGENT_TYPES; client rebuilds
  the keyed map so entry order matches `Object.fromEntries`
- ts-rs: `AgentReadinessReport` + check types generated into
  `daemon-client/src/gen`
- Client: `DaemonClient.agentReadiness(params)`; `status.service`
  daemon-primary only when no injectable seams (`readFile`, `access`,
  `runCommand`, `codexAuth` — functions can't cross the wire);
  serializable context (homeDir/path/assetRoot/skillRoots/
  builtInSkillNames) sent as params; any RPC failure → local path

## Out of scope

- Credentials resolvers (`credentials.ts` files) — consumed by
  capacity, not readiness; only the codex file-based auth probe is
  needed here
- `runCommand` injectables for other status checks (versionCheck,
  tmuxCheck, etc. stay local)
