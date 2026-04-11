---
name: memory
description: Use AI DevKit memory via CLI commands. Search before non-trivial work, store verified reusable knowledge, update stale entries, and avoid saving transcripts, secrets, or one-off task progress.
---

# AI DevKit Memory CLI

Use `npx ai-devkit@latest memory ...` as the durable knowledge layer.

## Workflow

1. For implementation, debugging, review, planning, or documentation tasks, search before deep work unless the task is trivial:
   ```bash
   npx ai-devkit@latest memory search --query "<task, subsystem, error, or convention>" --limit 5
   ```
   For broad or risky tasks, search multiple angles: subsystem, error text, framework, command, and task intent.

2. Use results as context:
   - Trust repo files, tests, fresh command output, and explicit user instructions over memory.
   - If memory conflicts with verified evidence, use the evidence and update the stale memory.
   - Mention memory only when it changes the plan or avoids asking the user again.

3. Search before storing:
   ```bash
   npx ai-devkit@latest memory search --query "<knowledge to store>" --table
   ```

4. Store or update only after the quality gate passes.

## Quality Gate

Before storing, all must be true:

- Future sessions are likely to reuse it.
- It is verified by code, docs, tests, command output, or explicit user instruction.
- It is not merely a restatement of obvious nearby files unless it prevents repeated agent mistakes.
- It is scoped narrowly enough.
- Existing memory does not already cover it.
- It contains no secrets, credentials, private customer data, personal data, raw logs, or temporary paths.

Store:
- Project conventions, user preferences, durable decisions.
- Reusable fixes, testing patterns, commands, setup gotchas.
- Non-obvious constraints, architecture rules, failure patterns.

Do not store:
- Task progress, transcripts, speculation, generic programming facts.
- Raw errors without diagnosis.
- Anything the user did not intend to persist.

## Commands

### Search

```bash
npx ai-devkit@latest memory search \
  --query "<query>" \
  --tags "<tags>" \
  --scope "<scope>" \
  --limit 5
```

Use `--table` to get IDs for updates:

```bash
npx ai-devkit@latest memory search --query "<query>" --table
```

Options: `--query/-q` required; `--tags`; `--scope/-s`; `--limit/-l` from 1-20; `--table`.

### Store

```bash
npx ai-devkit@latest memory store \
  --title "<actionable title, 10-100 chars>" \
  --content "<context, guidance, evidence, exceptions>" \
  --tags "<lowercase,tags>" \
  --scope "<global|project:name|repo:org/repo>"
```

Use this content shape when helpful:

```text
Context: Where this applies.
Guidance: What to do.
Evidence: File, command, test, or user instruction.
Exceptions: When not to apply it.
```

### Update

Find the ID with `search --table`, then update only changed fields:

```bash
npx ai-devkit@latest memory update \
  --id "<memory-id>" \
  --title "<updated title>" \
  --content "<updated content>" \
  --tags "<replacement,tags>" \
  --scope "<updated scope>"
```

`--tags` replaces all existing tags.

## Scoping

Use the narrowest useful scope:

- `repo:<org/repo>` for one repository.
- `project:<name>` for one app, product, or workspace.
- `global` only for knowledge that applies across unrelated projects.

If unsure, use a narrower scope.

## Troubleshooting

- CLI missing: run `npx ai-devkit@latest --version`.
- Duplicate title: search, then update the existing item if it is the same knowledge.
- Empty results: broaden terms, remove filters, or search symptoms and subsystem names separately.
- Validation error: check title/content lengths, query length, and `--limit` range.
- DB path: default is `~/.ai-devkit/memory.db`; project config can override it automatically.
