---
name: brainstorm
description: AI DevKit · Use when the user asks to brainstorm, ideate, generate ideas, expand options, challenge ideas, pressure-test ideas, compare concepts, narrow choices, name something, plan content angles, explore strategy, evaluate product ideas, technical approaches, experiments, or decisions.
---

# Brainstorm

Run a compact diverge-to-converge loop.

## Workflow

1. Frame: goal, constraints, audience, success criteria, assumptions.
2. Baseline: state the simplest honest solution first. Every option must beat it; the baseline stays a candidate.
3. Diverge: distinct options across practical, high-leverage, and unusual angles.
4. Challenge: weak assumptions, failure modes, tradeoffs, rejections. Always: reject speculative generality (each abstraction, layer, flag, and data copy needs a current caller) and verify load-bearing "needed" claims in the consuming code, not doc assertions.
5. Compare: only relevant criteria, plus deletion cost (how easily the option can be removed later). Ties go to the smaller option.
6. Converge: strongest 3 picks with rationale and a next step. Self-review first: for each new constant, object, layer, and flag ask "why do we need this?" Cut answers that are only messaging or future-proofing.

## Formats

Use Quick by default. Use Deep only for ambiguous or high-stakes decisions. Ask at most one clarifying question only if missing context would materially change the brainstorm; otherwise state assumptions and proceed.

- Quick: clusters, challenges, 3 picks.
- Deep: assumptions, clusters, evaluation table, recommendation.
- Naming: tone groups, fit, ambiguity, pronunciation.
- Technical: approaches, tradeoffs, risks, validation.
- Content: angles, hooks, audiences, outlines.

Avoid filler, near-duplicates, generic best practices, premature recommendations, and scope without a current caller. If asked for more ideas, explore a new axis before listing variants.
