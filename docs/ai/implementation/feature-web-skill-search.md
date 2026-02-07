---
phase: implementation
title: Implementation Guide
description: Technical implementation notes, patterns, and code guidelines
---

# Implementation Guide

## Development Setup
**How do we get started?**

```bash
cd web
npm install
npm run dev
```

Navigate to `http://localhost:3000/skills` to test.

## Code Structure
**How is the code organized?**

```
web/
├── app/
│   └── skills/
│       └── page.tsx          # Main skills page
├── components/               # (optional: extract if needed)
└── lib/                      # (optional: types)
```

## Implementation Notes
**Key technical details to remember:**

### Data Fetching
- Use `fetch` in `useEffect` for client-side loading
- Parse JSON and extract `skills` array
- Handle loading and error states

### Search Filtering
```typescript
const filteredSkills = skills.filter(skill =>
  skill.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
  skill.description.toLowerCase().includes(searchQuery.toLowerCase())
);
```

### Modal Implementation
- Use React state for `selectedSkill`
- Render conditionally when skill is selected
- Close on backdrop click or Escape key

### Copy to Clipboard
```typescript
navigator.clipboard.writeText(`npx ai-devkit skill add ${skill.name}`);
```

## Integration Points
**How do pieces connect?**

- Page fetches from: `https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/index.json`
- Follows existing page patterns from `app/page.tsx`
- Uses existing CSS variables from `globals.css`

## Error Handling
**How do we handle failures?**

- Network error → show retry button
- Empty results → show "No skills found" message
- Clipboard API failure → show fallback (select text)

## Performance Considerations
**How do we keep it fast?**

- Client-side filtering is fast for <1000 items
- Debounce search input if needed (usually not for <500 items)
- Lazy load images if skill icons are added later
