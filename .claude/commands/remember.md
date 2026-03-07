---
description: Store reusable guidance in the knowledge memory service.
---

Help me store it in the knowledge memory service.

1. **Capture Knowledge** — If not already provided, ask for: a short explicit title (5-12 words), detailed content (markdown, examples encouraged), optional tags (keywords like "api", "testing"), and optional scope (`global`, `project:<name>`, `repo:<name>`). If vague, ask follow-ups to make it specific and actionable.
2. **Search Before Store** — Check for existing similar entries first with `npx ai-devkit@latest memory search --query "<topic>"` to avoid duplicates.
3. **Validate Quality** — Ensure it is specific and reusable (not generic advice). Avoid storing secrets or sensitive data.
4. **Store** — Call `memory.storeKnowledge` with title, content, tags, scope. If MCP tools are unavailable, use `npx ai-devkit@latest memory store` instead.
5. **Confirm** — Summarize what was saved and offer to retrieve related memory entries when helpful.
6. **Next Command Guidance** — Continue with the current lifecycle phase command (`/execute-plan`, `/check-implementation`, `/writing-test`, etc.) as needed.
