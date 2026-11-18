---
phase: testing
title: #419 verification
---

# Testing — #419

## Commands

```bash
nvm use 24
npm run build
cd packages/cli && npm run test -- --run tests/services/skill/registry/skill-registry-source.test.ts
npx vitest run --config e2e/vitest.config.ts -t 'bare "."'
```

## Results (2026-11-18)

- Unit: 11/11 passed in `skill-registry-source.test.ts`
- E2E: bare-dot registry case passed; asserts no `Cloning` output, `file://` in config, no `~/.ai-devkit/skills/jarvis/skills` cache, successful `skill add`

## Manual repro

`skill add-registry jarvis/skills .` in a temp git repo with `skills/<name>/SKILL.md` — registered live path, exit 0, no skill cache directory.