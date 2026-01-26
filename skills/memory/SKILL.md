---
name: memory
description: Use AI DevKit's memory service to store and retrieve knowledge via CLI commands instead of MCP.
---

# AI DevKit Memory Skill

This skill teaches you how to use AI DevKit's **Memory** service through CLI commands. Memory allows you to store actionable insights, coding patterns, and project guidelines that persist across sessions.

## When to Use This Skill

Use the memory CLI commands when:
- MCP (Model Context Protocol) is not available or not configured
- You need to store knowledge directly from the terminal
- You want to search for previously stored patterns or guidelines
- You're scripting memory operations

## Prerequisites

Ensure AI DevKit CLI is available:
```bash
npx ai-devkit --version
```

## Commands Reference

### Storing Knowledge

Store new knowledge items using the `memory store` command:

```bash
npx ai-devkit memory store \
  --title "<short descriptive title>" \
  --content "<detailed knowledge content>" \
  --tags "<comma-separated tags>" \
  --scope "<scope>"
```

**Parameters:**

| Parameter   | Required | Description |
|-------------|----------|-------------|
| `--title`   | Yes      | Short, descriptive title (5-12 words, 10-100 chars) |
| `--content` | Yes      | Detailed explanation in markdown format (50-5000 chars) |
| `--tags`    | No       | Comma-separated domain keywords (e.g., `typescript,react`) |
| `--scope`   | No       | `global` (default), `project:<name>`, or `repo:<org/repo>` |

**Examples:**

```bash
# Store a global coding pattern
npx ai-devkit memory store \
  --title "Always handle BigInt serialization in API responses" \
  --content "When returning BigInt values from API endpoints, convert them to strings using \`BigInt.toString()\` before serialization. JSON.stringify() cannot serialize BigInt natively." \
  --tags "api,backend,serialization" \
  --scope "global"

# Store project-specific knowledge
npx ai-devkit memory store \
  --title "Use pnpm for package management" \
  --content "This monorepo uses pnpm workspaces. Always use 'pnpm' instead of 'npm' or 'yarn'. Install dependencies with 'pnpm install' and run scripts with 'pnpm run <script>'." \
  --scope "project:my-monorepo"

# Store repository-specific rules
npx ai-devkit memory store \
  --title "Database migrations require review" \
  --content "All database schema changes must be reviewed by the DBA team before merging. Create migration files in /migrations and tag the PR with 'needs-dba-review'." \
  --tags "database,migrations,process" \
  --scope "repo:myorg/backend-api"
```

### Searching Knowledge

Search for stored knowledge using the `memory search` command:

```bash
npx ai-devkit memory search --query "<search query>"
```

**Parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `--query` | Yes      | Natural language search query (3-500 chars) |
| `--tags`  | No       | Comma-separated tags to boost matching (e.g., `api,backend`) |
| `--scope` | No       | Filter by scope (results from matching scope are prioritized) |
| `--limit` | No       | Maximum results to return (1-20, default: 5) |

**Example:**

```bash
# Basic search
npx ai-devkit memory search --query "API response handling"

# Search with tag boosting
npx ai-devkit memory search \
  --query "docker configuration" \
  --tags "docker,infra"

# Search within a specific scope
npx ai-devkit memory search \
  --query "coding standards" \
  --scope "project:my-app" \
  --limit 10
```

**Output Format:**

The search command returns JSON with ranked results:

```json
{
  "results": [
    {
      "id": "uuid-string",
      "title": "Knowledge title",
      "content": "Detailed content...",
      "tags": ["tag1", "tag2"],
      "scope": "global",
      "score": 5.2
    }
  ],
  "totalMatches": 1,
  "query": "your search query"
}
```

## Best Practices

### Crafting Good Titles
- Be explicit and actionable: "Always validate user input before database queries"
- Include the domain: "React: Use useCallback for event handlers in list items"
- Keep it concise: 5-12 words that capture the essence

### Writing Effective Content
- Use markdown for formatting
- Include code examples when applicable
- Explain the "why" not just the "what"
- Add edge cases and exceptions

### Using Tags Effectively
- Use lowercase, single-word tags
- Include technology names: `typescript`, `react`, `docker`
- Include domains: `api`, `frontend`, `testing`, `security`
- Include action types: `debugging`, `performance`, `patterns`

### Choosing the Right Scope

| Scope | Use When |
|-------|----------|
| `global` | Knowledge applies to all your projects |
| `project:<name>` | Specific to a named project |
| `repo:<org/repo>` | Specific to a git repository |

## Integration with AI Workflows

When storing knowledge during a conversation:

1. **Before storing**, search to avoid duplicates:
   ```bash
   npx ai-devkit memory search --query "similar topic"
   ```

2. **After resolving an issue**, store the solution:
   ```bash
   npx ai-devkit memory store \
     --title "Fix: Issue description" \
     --content "Solution details with code examples..." \
     --tags "relevant,tags"
   ```

3. **Before starting a task**, search for relevant context:
   ```bash
   npx ai-devkit memory search --query "task description"
   ```

## Storage Location

All memory data is stored locally at:
```
~/.ai-devkit/memory.db
```

This SQLite database is portable—copy it to another machine to share knowledge.

## Troubleshooting

### "Duplicate title" error
A knowledge item with a similar title already exists in that scope. Either:
- Use a more specific title
- Update the existing entry (delete and re-add)
- Use a different scope

### "Query too short" error
Search queries must be at least 3 characters. Provide more context in your search.

### Empty search results
- Broaden your search terms
- Remove tag filters
- Try different keyword variations
