---
phase: implementation
title: Memory Hybrid Noise Reduction Implementation
description: Record the selected fusion changes and empirical development workflow
---

# Memory Hybrid Noise Reduction Implementation

## Changed Code

- `packages/memory/src/semantic/embeddings.ts`
  - Changes `RRF_K` from 60 to 10.
  - Adds the internal `SEMANTIC_ONLY_MIN_SIMILARITY = 0.5` constant.
  - Applies the threshold only after checking for an existing lexical candidate, preserving low-similarity semantic reinforcement of lexical results.
- `packages/memory/tests/unit/semantic/embeddings.test.ts`
  - Verifies a 0.49 semantic-only candidate is suppressed, a 0.50 candidate is admitted, and a shared lexical candidate remains.
  - Verifies lexical rank 1 outranks weak agreement at lexical/semantic rank 20 with tighter RRF decay.

## Integration

`fuseSearchResults` remains the single ranking seam used by `searchKnowledgeHybrid`. CLI and MCP callers receive the existing result structure and semantic explanation fields. The storage, embedding, fallback, and model-loading paths are untouched.

## Benchmark Procedure

The community benchmark was run in dev mode against the built CLI, not an npm release:

```bash
cd /home/ubuntu/code/agent-memory-bench
AI_DEVKIT_BIN=/home/ubuntu/code/ai-devkit/.worktrees/feature-memory-noise/packages/cli/dist/cli.js \
  npm run bench -- --label <candidate> --semantic --output /tmp/<candidate>.json
```

Each candidate was applied, built, and measured against the same expanded-100 fixture definition. Rejected ranking candidates were reverted before the next standalone experiment. No experiment row was added to the released-version leaderboard.

## Operational Considerations

- No migration, deployment configuration, or rollback operation is required.
- Reverting the two selected commits restores the previous fusion policy.
- The threshold can reduce result count for weak semantic-only queries; the API already permits fewer results than the requested maximum.
