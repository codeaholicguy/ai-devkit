---
phase: planning
title: Docs and metadata consistency
---

# Docs and metadata consistency

## Approach

1. Search repo for tagline/description slots (`control plane`, workflow package descriptions, layout metadata).
2. Update tagline to: `Let any coding agent run and talk to any other, locally`.
3. Fix user-facing Node version lines in `web/content/docs` and `web/app/page.tsx`.
4. Fix README support matrix: Kiro project `init` → control plane only; add footnote if needed alongside existing setup paragraph.
5. Run `oxfmt`, lint, web build, relevant tests.

## Verification

- `npm run lint`
- `npm run build` in `web/` if present
- CLI package tests touching setup/status if time permits