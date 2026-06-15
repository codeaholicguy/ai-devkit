# @ai-devkit/memory-dashboard

Local web dashboard for browsing and assessing AI DevKit memory.

```bash
ai-devkit memory-dashboard
```

The MVP is implemented as an AI DevKit plugin package with a `memory-dashboard` command.

The UI is split across `src/ui/dashboard.html`, `src/ui/tailwind.css`, and `src/ui/app.js`. The build emits Tailwind CSS and copies the UI assets into `dist/ui`. The graph view uses Cytoscape.js with memory, tag, and scope nodes plus Fit/Layout controls.

For local development without installing the plugin into AI DevKit:

```bash
npm run dev:standalone
```

The standalone script reads the same default/configured memory database path as the plugin runtime. Use `--db-path` to point it at a fixture database:

```bash
npm run dev:standalone -- --db-path /tmp/memory.db --port 3000
```
