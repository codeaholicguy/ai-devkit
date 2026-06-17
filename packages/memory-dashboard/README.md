# @ai-devkit/memory-dashboard

A local web dashboard for browsing AI DevKit memory.

## Usage

After installing the plugin, start the dashboard with:

```bash
ai-devkit memory-dashboard
```

The command prints a local URL. Open it in your browser to search, filter, group, and inspect memory records.

## Development

```bash
npm run dev:standalone
```

Use a custom database path when testing with fixture data:

```bash
npm run dev:standalone -- --db-path /tmp/memory.db --port 3000
```

## Build

```bash
npm run build
npm test
```
