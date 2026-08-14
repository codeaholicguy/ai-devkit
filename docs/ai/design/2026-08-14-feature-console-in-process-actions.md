---
phase: design
title: Console In-Process Actions Design
description: Shared application-service boundary for Commander and the agent console
---

# Console In-Process Actions Design

## Architecture

```mermaid
flowchart LR
    Commander[Commander handlers] --> AgentPackage[@ai-devkit/agent-manager services]
    Commander --> ChannelPackage[@ai-devkit/channel-connector services]
    Console[Console hooks and shell] --> Runner[In-process console action runner]
    Runner --> AgentPackage
    Runner --> ChannelPackage
    AgentPackage --> AgentManager[Agent manager / terminal / tmux / registry]
    ChannelPackage --> Channel[ConfigStore / bridge registry]
    Channel --> Daemon[Detached channel daemon]
    Commander --> CliUI[CLI reporter + exit adapter]
    Console --> Pending[Immediate pending state + duplicate guard]
```

Commander remains responsible for parsing command-only input such as stdin, debug flags, interactive selection, CLI rendering, and applying an exit directive. Application services live in the packages that own their dependencies: agent lifecycle and terminal operations in `@ai-devkit/agent-manager`, and channel configuration/bridge process state in `@ai-devkit/channel-connector`. The console imports those public package services directly. The CLI alone resolves its source/build-specific channel-daemon entrypoint and passes that launch descriptor into the channel service.

## Service Contract

```ts
interface ApplicationActionResult {
  ok: boolean;
  message?: string;
  cliExitCode?: number;
}
```

Services accept explicit dependencies (manager, focus manager, registry, tmux manager, config store, bridge service, reporter, and optional interactive selector). Defaults construct package-native production dependencies. Tests inject boundary doubles. Package services must not import CLI UI, debug, path-layout, group-storage, or process-exit modules.

`cliExitCode` is independent from `ok`: existing open/kill lookup failures produce command errors without forcing exit 1, while invalid start/rename and typed start failures retain exit 1. Commander applies only the explicit directive. Console uses `ok` and `message` for inline feedback.

## Pending State

The console uses a synchronous keyed pending gate. `begin(key, label)` records pending before invoking the async service and rejects a duplicate key until the promise settles. State notifications drive transient UI text. Required labels are `Sending`, `Opening`, and `Stopping channel`; other actions retain their existing pane submitting/confirmation behavior while gaining duplicate protection.

Tests assert the notification and pending snapshot immediately after submission and before resolving a deferred promise. No elapsed-time assertion is used, so the test deterministically proves the UI acknowledgement occurs in the same call stack and therefore satisfies the 50 ms target independent of machine load.

## Compatibility and Security

- Services reuse `sendToAgent`, `startAgent`, `killAgent`, `TerminalFocusManager`, `AgentRegistry`, `TmuxManager`, `ConfigStore`, and `ChannelService` rather than reimplementing lower-level behavior.
- The reusable services and their lower-level operations are exported by their owning packages; `packages/cli` does not duplicate them.
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
- Keep reusable services under `packages/cli`: rejected because it makes the console consume a CLI-owned reimplementation and prevents other package consumers from using the same behavior.

## Risks

- Output or exit drift during extraction: keep command tests and add wrapper/service tests.
- React state closure allows rapid duplicate input: use a synchronous mutable gate, not state alone.
- Service result loses useful error text: reporter captures the first/most relevant error while services also return a message.
- Channel daemon launch path differs between source and build: retain the resolver in the CLI adapter and pass a structured launch descriptor into the package service.
