---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
feature: skill-add-interactive-selection
---

# Implementation Guide - Skill Add Interactive Selection

## Development Setup
**How do we get started?**

- Work in branch `feature-skill-add-interactive-selection`.
- Use the existing CLI test setup under `packages/cli/src/__tests__`.
- Reuse `inquirer` and existing `SkillManager` helpers instead of adding new dependencies.

## Code Structure
**How is the code organized?**

- Command entrypoint: `packages/cli/src/commands/skill.ts`
- Main orchestration: `packages/cli/src/lib/SkillManager.ts`
- Tests: `packages/cli/src/__tests__/commands/skill.test.ts` and `packages/cli/src/__tests__/lib/SkillManager.test.ts`

## Implementation Notes
**Key technical details to remember:**

### Core Features
- Feature 1: Accept an omitted `<skill-name>` argument in the `skill add` command.
- Feature 2: Enumerate installable skills from the resolved registry checkout.
- Feature 3: Prompt for one skill and hand the result back into the existing install path.

### Patterns & Best Practices
- Keep explicit two-argument installs on the current path.
- Isolate prompt selection from installation side effects.
- Skip malformed entries instead of failing enumeration wholesale.

## Integration Points
**How do pieces connect?**

- Registry lookup continues through merged registry resolution.
- Cache refresh continues through the current clone/pull helpers.
- Project config updates remain in `ConfigManager.addSkill`.

## Error Handling
**How do we handle failures?**

- Missing registry: fail before prompting.
- Empty registry: fail with a message explaining no valid skills were found.
- Prompt cancellation: exit cleanly without installation.
- Non-interactive invocation without skill name: fail with explicit remediation text.

## Performance Considerations
**How do we keep it fast?**

- Reuse the cloned cache after registry resolution.
- Read only direct `skills/*/SKILL.md` entries needed to build the prompt.

## Security Notes
**What security measures are in place?**

- Preserve existing registry and skill name validation.
- Do not install unvalidated paths derived from arbitrary user input.
