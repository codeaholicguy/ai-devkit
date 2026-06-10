# @ai-devkit/pi-session-tracker

A [Pi](https://pi.dev) extension that tracks all active Pi sessions in a shared JSON registry at `~/.pi/agent/sessions.json`.

## What it does

- **On session start** — registers `{ pid: sessionFilePath }` in the registry
- **On session shutdown** — removes the pid from the registry

The registry always reflects currently-running Pi sessions:

```json
{
  "12345": "/Users/you/.pi/sessions/abc123.jsonl",
  "67890": "/Users/you/.pi/sessions/def456.jsonl"
}
```

## Install

```bash
pi install npm:@ai-devkit/pi-session-tracker
```

Or try it without installing:

```bash
pi -e npm:@ai-devkit/pi-session-tracker
```

## Registry location

```
~/.pi/agent/sessions.json
```

The directory is created automatically if it does not exist.

## Use cases

- **Multi-agent orchestration** — discover and communicate with other running Pi processes
- **Session dashboards** — know which session files are actively in use
- **Tooling integrations** — external scripts that need to find the current Pi session file
