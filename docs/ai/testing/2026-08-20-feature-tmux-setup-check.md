---
phase: testing
title: Tmux Setup Prerequisite Testing
description: Mock-only coverage and workspace validation evidence
---

# Tmux Setup Prerequisite Testing

- [x] Available version parsing, raw output, missing executable, execution failure, and unparsed output.
- [x] Quoted/malformed os-release parsing.
- [x] Debian/Ubuntu, Fedora/RHEL-like, Alpine, Arch/Manjaro, and macOS recipes.
- [x] WSL labeling, Nix guidance, BSD/native Windows punts, and unknown/missing os-release fallback.
- [x] Setup success, missing, and error output with warning-and-continue behavior.
- [x] Interactive start guard includes the shared platform hint.

All tests inject subprocess, filesystem, platform, release, and PATH behavior. They never install software or invoke a real package manager.

## Fresh Validation Evidence

- `npm ci`: exit 0.
- `npm run build`: exit 0; all six projects built, including TypeScript declaration compilation.
- `npm test`: exit 0; 85 files and 1,042 tests passed across six projects.
- `npm run lint`: exit 0; five pre-existing unrelated warnings, zero errors.
- `npm run test:e2e`: exit 0; 41 tests passed.
- `npx ai-devkit@latest lint --feature tmux-setup-check`: exit 0.
- Targeted `tmux.ts` coverage: 100% statements, branches, functions, and lines across 19 mock-only tests.
