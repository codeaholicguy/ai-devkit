export interface SetupToolEntry {
  tool: string;
  slug: string;
}

const rawSetupTools = [
  "Cursor",
  "Claude Code",
  "Codex",
  "Antigravity",
  "OpenCode",
  "GitHub Copilot",
];

function slugifyTool(tool: string): string {
  return tool
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function buildEntries(tools: string[]): SetupToolEntry[] {
  const seen = new Set<string>();
  const entries: SetupToolEntry[] = [];

  tools.forEach((tool) => {
    const slug = slugifyTool(tool);
    if (!slug || seen.has(slug)) {
      return;
    }

    seen.add(slug);
    entries.push({ tool, slug });
  });

  return entries;
}

export const setupToolEntries = buildEntries(rawSetupTools);

export function findSetupToolBySlug(slug: string): SetupToolEntry | null {
  return setupToolEntries.find((entry) => entry.slug === slug) ?? null;
}
