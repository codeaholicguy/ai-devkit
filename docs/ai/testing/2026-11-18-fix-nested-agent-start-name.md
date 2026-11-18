---
phase: testing
title: Testing — #402 nested agent start name
---

# Testing — #402

## Unit

- `packages/agent-manager/tests/utils/homeScope.test.ts` — mismatch detection, store probe
- `packages/agent-manager/tests/runtime/ManagedAgentRuntime.test.ts` — divergent HOME refuse/warn, round-trip failure
- `packages/daemon-client/tests/homeScope.test.ts` — mirrored helper
- `packages/daemon-client/tests/autostart-divergent-home.test.ts` — autostart refusal
- `packages/agent-manager/tests/AgentManager.test.ts` — `unregistered:` prefix expectation

## E2E

- `e2e/agent-start-home-divergence.e2e.ts` — divergent HOME refuse shape

## Commands

```bash
npm run build
npx nx run agent-manager:test
npx nx run daemon-client:test
npx vitest run --config e2e/vitest.config.ts e2e/agent-start-home-divergence.e2e.ts
```