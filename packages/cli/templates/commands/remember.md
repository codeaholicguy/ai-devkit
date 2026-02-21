---
description: Store reusable guidance in the knowledge memory service.
---

When I say "remember this" or want to save a reusable rule, help me store it in the knowledge memory service.

1. **Capture Knowledge** — If not already provided, ask for: a short explicit title (5-12 words), detailed content (markdown, examples encouraged), optional tags (keywords like "api", "testing"), and optional scope (`global`, `project:<name>`, `repo:<name>`). If vague, ask follow-ups to make it specific and actionable.
2. **Validate Quality** — Ensure it is specific and reusable (not generic advice). Avoid storing secrets or sensitive data.
3. **Store** — Call `memory.storeKnowledge` with title, content, tags, scope. If MCP tools are unavailable, use `npx ai-devkit@latest memory store` instead.
4. **Confirm** — Summarize what was saved and offer to store more knowledge if needed.
