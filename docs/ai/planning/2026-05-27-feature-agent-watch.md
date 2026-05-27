---
phase: planning
title: Project Planning & Task Breakdown
description: Break down work into actionable tasks and estimate timeline
---

# Project Planning & Task Breakdown — Agent Watch

## Milestones

- [ ] **M1 — Skeleton runs**: `ai-devkit agent watch` launches an Ink app that lists agents (no preview, no actions).
- [ ] **M2 — Preview works**: selecting an agent renders its recent conversation, refreshes automatically.
- [ ] **M3 — Actions work**: `⏎` opens an agent (suspend/resume), `m` sends a message.
- [ ] **M4 — Polish + tests**: narrow-terminal fallback, error states, unit tests, manual smoke against Claude + Codex.

## Task Breakdown

### Phase 1 — Foundation
- [x] **T1.1** Add `ink`, `ink-text-input` to `packages/cli` dependencies; verify build still passes. _(Picked Ink 3.2.0 + React 17 because the CLI compiles to CommonJS and Ink 4+ is ESM-only. Added `jsx: "react"` to `packages/cli/tsconfig.json`.)_
- [x] **T1.2** Create directory scaffold under `packages/cli/src/tui/watch/` per design file layout. Empty placeholder files only. _(Created subdirs `hooks/`, `actions/`, `render/`, `state/`. Files added incrementally per later tasks.)_
- [x] **T1.3** Register `agent watch` subcommand in `packages/cli/src/commands/agent.ts`. TTY guard: if `!process.stdout.isTTY`, print error and exit 1. Instantiate `AgentManager`, call `render(<WatchApp manager={...} />)`. _(Verified `--help` renders and TTY guard fires under non-TTY stdin. Lazy-require Ink/React/WatchApp so they only load when this command runs.)_

### Phase 2 — Core Features
- [x] **T2.1** Implement `useAgentList` polling hook: 2s interval, in-flight cancellation via `runToken`, returns `{ agents, error, lastUpdated }`. Errors keep stale data visible. _(`hooks/useAgentList.ts`. Tracks `mountedRef` + `runTokenRef` so stale fetches don't commit. Errors set `error` but leave `agents` intact. Exports `LIST_POLL_INTERVAL_MS = 2000`. Build passes.)_
- [x] **T2.2** Implement `useAgentConversation` hook: 1s interval for the selected agent; refetch immediately on selection change; same `runToken` discipline. _(`hooks/useAgentConversation.ts`. Fetches via `manager.getAdapter(type).getConversation(sessionFilePath)`. mtime cache skips re-parse when the session file hasn't changed. Classifies errors as `no-session-file`/`no-adapter`/`parse-error` for distinct preview copy later.)_
- [x] **T2.3** Implement `AgentListPane` — table render of name, type, status (color + glyph + label), summary, lastActive (relative). Keyboard nav `↑↓`/`j k`. Uses native `listAgents()` order (no client-side sort). _(`AgentListPane.tsx`. Auto-selects first agent and re-selects on list change if the previous selection disappeared. Empty-state copy shipped. Wired into `WatchApp` — `agent watch` now renders the live list. M1 milestone reached.)_
- [x] **T2.4** Implement `formatStatus` render helper: per-status color + non-color glyph (e.g., `● run`, `◐ wait`, `○ idle`, `? unk`). _(`render/formatStatus.tsx`. Glyph + short label, color is reinforcement not the sole signal. Exports `statusDisplayWidth()` for column sizing.)_
- [x] **T2.5** Implement `PreviewPane` — render messages by role (user/assistant/system). _(`PreviewPane.tsx`. `ConversationMessage` is `{role, content, timestamp}` only — no separate tool_use/tool_result, tool calls already embedded in content. So the `v`-to-expand keybinding and auto-scroll/`G` complexity are out: instead we render from most-recent backward into a fixed line budget (~`rows-8`), guaranteeing the latest message is always visible. Master-detail layout wired into WatchApp with 40%/60% split. Narrow-terminal fallback already present (<100 cols hides preview, footer note shown). M2 milestone reached.)_
- [x] **T2.6** Implement `StatusFooter` — agent counts (running / waiting / idle), selected agent metadata (cwd, message count, last active), keybinding hints, transient error/info line. _(`StatusFooter.tsx`. Shows counts, last-updated relative time, keybinding hint, selected agent meta. Accepts a `transient` prop for action feedback.)_
- [x] **T2.7** Implement `WatchApp` root: owns selection, modal flag, error banner; wires hooks to panes; handles global keys (`q`, `r`, `v`). _(`WatchApp.tsx`. Owns `selectedName`, derives `selectedAgent`, computes narrow layout. Modal flag will be added in T3.2.)_

### Phase 3 — Integration & Polish
- [x] **T3.1** Implement `runAgentOpen` action: `app.unmount()` → `spawn('ai-devkit', ['agent', 'open', name], { stdio: 'inherit' })` → await exit → re-`render(<WatchApp />)` with `initialSelection` prop. Preserve selection across the round trip. _(`actions/runAction.ts`. Resolves CLI entry via `process.execPath` + `path.resolve(__dirname, ../../../cli.js)` so it works regardless of PATH. The render/exit loop lives in the `agent watch` command and re-mounts with `lastSelection` and a `transient` message on action failure. Requires manual TTY smoke to verify suspend/resume cleanliness — deferred to T4.4.)_
- [x] **T3.2** Implement `SendMessageModal` overlay (`ink-text-input`): captures text, on submit calls `runAgentSend` (same spawn pattern, `agent send --id <name> <text>`), on cancel returns to list. Empty input is a no-op cancel. _(`SendMessageModal.tsx`. `m` toggles open, Enter submits, Esc cancels. Submit triggers a `send` intent which routes through the same suspend/resume loop in the command. M3 milestone reached.)_
- [x] **T3.3** Implement narrow-terminal fallback (<100 cols hides preview, footer shows `resize ≥100 cols to show preview`). _(Completed inside T2.5/T2.6 — `WatchApp` reads `process.stdout.columns` once per render, hides preview pane below 100 cols, footer shows the resize hint. No dedicated `useTerminalSize` hook needed yet; can be added if dynamic resize feels janky during smoke testing.)_
- [x] **T3.4** Empty-state copy: zero agents, missing session file, empty conversation, action error. _(Implemented across `AgentListPane` ("No running agents detected"), `PreviewPane` ("No messages yet" / "No session file available" / typed `parse-error` copy), `StatusFooter` (transient error line). No separate "ended agent banner" — when an agent disappears the list auto-selects another; preview shows "No messages yet" if the new selection's session is bare. Acceptable for v1.)_
- [ ] **T3.5** Document the command in `web/content/docs/8-agent-management.md` under a new "Watch Agents" section. Mark experimental.

### Phase 4 — Verification (handed to Phases 6–8 of dev-lifecycle)
- [ ] **T4.1** Unit tests for `useAgentList` / `useAgentConversation` polling/cancellation (mock manager).
- [ ] **T4.2** Unit tests for `formatMessage` render helper (assistant text, tool_use one-liner, tool_result one-liner, expansion).
- [ ] **T4.3** Snapshot tests for `AgentListPane` and `PreviewPane` via `ink-testing-library` — happy path, empty, error.
- [ ] **T4.4** Manual smoke on macOS: one Claude Code + one Codex agent running concurrently; verify launch <1s, selection-to-preview <1s, `⏎`/`m` round trips, narrow-terminal fallback, ended-agent banner.

## Dependencies

| Task | Depends on |
|---|---|
| T1.3 | T1.1, T1.2 |
| T2.1, T2.2 | T1.3 |
| T2.3 | T2.1, T2.4 |
| T2.5 | T2.2 |
| T2.6, T2.7 | T2.3, T2.5 |
| T3.1, T3.2 | T2.7 |
| T3.3 | T2.7 |
| T3.4 | T2.7 |
| T3.5 | T3.1, T3.2 done (so doc reflects shipped behavior) |
| T4.1–T4.3 | their corresponding implementation tasks |
| T4.4 | all of Phase 1–3 |

External dependencies: `@ai-devkit/agent-manager` (existing, internal). `ai-devkit agent open` / `agent send` (existing CLI verbs).

## Implementation order (linear)

1. T1.1 → T1.2 → T1.3 (skeleton compiles and runs, prints "TUI placeholder")
2. T2.1 → T2.4 → T2.3 (M1: list renders and updates)
3. T2.2 → T2.5 (M2: preview renders and updates)
4. T2.6 → T2.7 (footer + global keys wired)
5. T3.1 → T3.2 (M3: actions work)
6. T3.3 → T3.4 (polish)
7. T3.5 (docs)
8. T4.1–T4.4 (verification; Phase 7 of dev-lifecycle)

## Timeline & Estimates

| Phase | Effort | Notes |
|---|---|---|
| Foundation | 0.5d | Mostly dependency wiring + boilerplate. |
| Core Features | 2d | Bulk of the work; hooks + three pane components. |
| Integration & Polish | 1d | Suspend/resume is the only risky bit; tested early via T3.1. |
| Verification | 1d | Unit + snapshot + manual smoke. |
| **Total** | **~4.5d** | Within the single-developer-week target from requirements. |

## Risks & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Ink suspend/resume leaves terminal in a bad state (alt-screen artifacts) after `agent open` | Medium | High — kills the "feels like a hub" UX | Build T3.1 early (immediately after T2.7). If broken, fall back to TUI-exits-on-open pattern documented as known limitation. |
| `getConversation()` is slow on large session files at 1Hz | Medium | Medium — preview lags | Use `--tail 20` semantics (already supported by adapter); cache by session-file mtime so unchanged files don't re-parse. |
| Inputs collide with Ink built-in raw-mode quirks (e.g., Ctrl-C handling) | Low | Medium | Use Ink's `useInput` hook conventionally; let Ctrl-C exit normally; document `q` as the standard exit. |
| `ink-text-input` ergonomics for the send modal feel cramped | Low | Low | If problematic, switch to `ink-multi-select-input`-style or roll a minimal input using `useInput`. |
| `child_process.spawn` cannot find `ai-devkit` in PATH when invoked from inside a worktree's `node_modules/.bin` | Low | High — actions fail silently | Resolve the path explicitly: `process.execPath` + the absolute CLI entry script, or use `npm bin` resolution. Validate in T3.1. |
| Adapter parse error (e.g., session file mid-write) crashes a fetch | Medium | Low | Manager already swallows per-adapter errors; the TUI surfaces them as a footer line and keeps polling. |

## Resources Needed

- One developer (TypeScript + React familiarity).
- Local Claude Code and Codex agents for smoke testing.
- macOS dev machine (iTerm2 or Apple Terminal for `agent open` verification).
- Existing CI pipeline (no infra changes).
