---
phase: design
title: Console In-Process Actions Design
description: Shared application-service boundary for Commander and the agent console
---

# Console In-Process Actions Design

## Architecture

```mermaid
flowchart LR
    Commander[Commander handlers] --> Services[Agent and channel action services]
    Console[Console hooks and shell] --> Runner[In-process console action runner]
    Runner --> Services
    Services --> AgentManager[Agent manager / terminal / tmux / registry]
    Services --> Channel[ConfigStore / ChannelService]
    Channel --> Daemon[Detached channel daemon]
    Commander --> CliUI[CLI reporter + exit adapter]
    Console --> Pending[Immediate pending state + duplicate guard]
```

Commander remains responsible for parsing command-only input such as stdin, debug flags, interactive selection, CLI rendering, and applying an exit directive. Application services own validation and orchestration shared with the TUI. The console runner dispatches the `ConsoleAction` union directly to those services and translates their structured result to the existing `ActionResult` contract.

## Service Contract

```ts
interface ApplicationActionResult {
  ok: boolean;
  message?: string;
  cliExitCode?: number;
}
```

Services accept explicit dependencies (manager, focus manager, registry, tmux manager, config store, channel service, daemon launch resolver, reporter, and optional interactive selector). Defaults construct the same production dependencies currently constructed in command handlers. Tests inject boundary doubles.

`cliExitCode` is independent from `ok`: existing open/kill lookup failures produce command errors without forcing exit 1, while invalid start/rename and typed start failures retain exit 1. Commander applies only the explicit directive. Console uses `ok` and `message` for inline feedback.

## Pending State

The console uses a synchronous keyed pending gate. `begin(key, label)` records pending before invoking the async service and rejects a duplicate key until the promise settles. State notifications drive transient UI text. Required labels are `Sending`, `Opening`, and `Stopping channel`; other actions retain their existing pane submitting/confirmation behavior while gaining duplicate protection.

Tests assert the notification and pending snapshot immediately after submission and before resolving a deferred promise. No elapsed-time assertion is used, so the test deterministically proves the UI acknowledgement occurs in the same call stack and therefore satisfies the 50 ms target independent of machine load.

## Compatibility and Security

- Services reuse `sendToAgent`, `startAgent`, `killAgent`, `TerminalFocusManager`, `AgentRegistry`, `TmuxManager`, `ConfigStore`, and `ChannelService` rather than reimplementing lower-level behavior.
- CLI reporters preserve exact existing output strings and spinner behavior.
- Commander retains stdin/debug/group/print/wait parsing and presentation paths; only the shared interactive-agent action path moves behind services.
- Channel start still launches the dedicated daemon with `spawn` inside `ChannelService`; console actions no longer reinvoke the whole CLI.
- No shell is introduced. User values remain ordinary method inputs and daemon argv elements.
- Config and registry access stays behind existing stores/services; channel secrets are never returned to the TUI.

## Alternatives Considered

- Reuse Commander handlers directly: rejected because they couple services to parsing, `process.exit`, prompts, and terminal output.
- Keep subprocesses behind a generic executor: rejected because it retains startup latency and duplicate orchestration.
- Create TUI-only direct implementations: rejected because it leaves two behavior sources and risks validation/security drift.
- Extract all command modes into one large service: rejected because group, print, stdin, and wait modes are not console actions; retaining them in thin command orchestration reduces scope while sharing the requested interactive paths.

## Risks

- Output or exit drift during extraction: keep command tests and add wrapper/service tests.
- React state closure allows rapid duplicate input: use a synchronous mutable gate, not state alone.
- Service result loses useful error text: reporter captures the first/most relevant error while services also return a message.
- Channel daemon launch path differs between source and build: move the existing resolver intact into the shared channel action module.
