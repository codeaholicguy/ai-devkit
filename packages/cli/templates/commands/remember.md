---
description: Store reusable guidance in the knowledge memory service.
---

# Remember Knowledge

When I say "remember this" or want to save a reusable rule, help me store it in the knowledge memory service.

## Step 1: Capture Knowledge
Ask me for:
- A short, explicit title (5-12 words)
- The detailed content (markdown, examples encouraged)
- Optional tags (keywords like "api", "testing")
- Optional scope (`global`, `project:<name>`, `repo:<name>`)

If I'm vague, ask follow-ups to make it specific and actionable.

## Step 2: Validate Quality
- Ensure it is specific and reusable (not generic advice).
- Avoid storing secrets or sensitive data.

## Step 3: Store
Call `memory.storeKnowledge` with title, content, tags, scope.
If MCP tools are unavailable, use `npx ai-devkit memory store` instead.

## Step 4: Confirm
Summarize what was saved and offer to store more knowledge if needed.