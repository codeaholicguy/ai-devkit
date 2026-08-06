# @ai-devkit/channel-connector

Bridge AI DevKit agent sessions to external messaging channels.

This package powers the `ai-devkit channel` commands. Use it when you need the lower-level connector layer that routes messages between running AI coding agents and channels such as Telegram and private Slack DMs.

## What It Provides

- **Channel abstraction** — Common interface for external messaging channels
- **Agent routing** — Forward prompts to running AI coding agent sessions
- **Response delivery** — Send agent output back through the connected channel
- **Connector foundation** — Shared utilities for adding future channels

## Typical Use

Most users should use the CLI:

```bash
ai-devkit channel connect telegram
ai-devkit channel connect slack --name work-slack
ai-devkit channel start --agent <agent-name>
```

Use this package directly only when building custom channel integrations or extending AI DevKit's remote-control surface.

Slack uses the official `@slack/socket-mode` and `@slack/web-api` clients. The current proof of concept is a user-owned, single-workspace, DM-only Socket Mode app without Slack-user authorization. Use it only in a disposable/private workspace with a non-sensitive agent session. Public channels, OAuth distribution, files, and multi-workspace routing are not supported.

## Documentation

Full guides and workflow examples: **[ai-devkit.com/docs](https://ai-devkit.com/docs/)**

## License

MIT
