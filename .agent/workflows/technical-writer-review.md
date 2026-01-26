---
description: Review and improve documentation for novice users with technical writing best practices
---

# Technical Writer Review Workflow

Review documentation files from a professional technical writer's perspective, focusing on novice user experience.

## Review Criteria

For each document, evaluate:

### 1. Clarity (Is it easy to understand?)
- Does it explain concepts before using them?
- Does it avoid jargon, or explain it when necessary?
- Are examples concrete and realistic?

### 2. Completeness (Does it cover what users need?)
- Does it explain *what* something is before *how* to use it?
- Are prerequisites clearly stated?
- Are there quick start examples?
- Are edge cases and errors addressed?

### 3. Actionability (Can users follow along?)
- Are commands copy-paste ready?
- Is expected output shown?
- Are "when to use" hints provided?
- Do links to related docs exist?

### 4. Structure (Is it well organized?)
- Does the order make sense for newcomers?
- Are sections clearly separated?
- Is there a logical flow from simple to complex?

## Review Output Format

For each document, provide:

```markdown
## [Document Name]

| Aspect | Rating (1-5) | Notes |
|--------|--------------|-------|
| Clarity | ⭐⭐⭐ | ... |
| Completeness | ⭐⭐ | ... |
| Actionability | ⭐⭐⭐⭐ | ... |
| Structure | ⭐⭐⭐ | ... |

**Issues:**
1. Issue description
2. Issue description

**Suggested Fixes:**
- Fix description
```

## Common Patterns to Fix

| Issue | Fix |
|-------|-----|
| Missing intro | Add opening paragraph explaining what and why |
| No prerequisites | Add prerequisites section with requirements |
| Jargon without explanation | Add callout boxes explaining terminology |
| No examples | Add Quick Start or example sections |
| Flat structure | Organize into logical sections |
| No cross-references | Add "Next Steps" or "See Also" links |
| Terminal vs editor confusion | Clarify which commands run where |

## Workflow Steps

1. **Read the document** from start to finish as a novice would
2. **Rate each aspect** using the criteria above
3. **Identify specific issues** with line references
4. **Suggest concrete fixes** with example text
5. **Prioritize fixes** as High/Medium/Low impact

## Priority Levels

- **High**: Blocks novice users from succeeding
- **Medium**: Causes confusion but users can figure it out
- **Low**: Nice to have improvements
