export interface SeoKeywordEntry {
  keyword: string;
  slug: string;
}

const titleCaseOverrides: Record<string, string> = {
  ai: "AI",
  llm: "LLM",
  mcp: "MCP",
  cli: "CLI",
  ide: "IDE",
  vscode: "VSCode",
  devops: "DevOps",
  api: "API",
  vs: "vs",
};

const rawSeoKeywords = [
  "Working with ai coding agents",
  "AI coding tools for real production systems",
  "AI coding tools for maintainable code",
  "AI development tools for engineers",
  "AI development tools for startups",
  "AI development tools for internal platforms",
  "AI development tools for automation",
  "AI development tools for agents",
  "AI development tools for LLM workflows",
  "AI development tools with MCP",
  "AI development tools for AI agents",
  "AI coding assistant for developers",
  "AI coding assistant for vscode",
  "AI coding assistant for terminal",
  "AI coding assistant for refactoring",
  "AI coding assistant for debugging",
  "AI coding assistant for code review",
  "AI coding assistant for unit tests",
  "Best AI coding tools",
  "AI coding tools for developers",
  "AI coding tools for software engineers",
  "AI coding tools for teams",
  "AI coding tools for large codebases",
  "AI coding tools with memory",
  "AI coding tools with cli",
  "AI coding tools for backend development",
  "AI coding tools for frontend development",
  "AI coding tools for devops",
  "AI coding tools for startups",
  "AI coding tools for enterprise",
  "Best AI coding tool for teams",
  "AI coding tools for enterprise engineering teams",
  "AI coding tools with CLI support",
  "How to customize AI coding assistants with rules",
  "AI coding tools for enforcing coding standards",
  "AI coding tools for reducing code review time",
  "AI coding tools for large legacy codebases",
  "AI coding tools for senior software engineers",
  "Best practices for working with AI coding assistants",
  "Best AI coding tools for professional developers",
  "AI coding tools comparison for large codebases",
  "Best AI coding assistant for backend development",
  "Best AI coding tools for frontend engineers",
  "AI coding tools for DevOps and scripting",
  "AI coding tools that work well with monorepos",
  "AI coding tools with project memory",
  "AI coding toolkit CLI",
  "Tools for Claude Code workflow",
  "Tools for Cursor workflow",
  "Tools for Codex workflow",
  "Tools for Antigravity workflow",
  "Tools for OpenCode workflow",
  "AI coding agent memory tools",
  "Cursor workflow tools",
  "Claude Code workflow tools",
  "Codex workflow tools",
  "Antigravity workflow tools",
  "OpenCode workflow tools",
  "AI agent skill management",
  "memory system for ai coding agents",
  "persistent memory for ai agents",
  "cli memory for ai agents",
  "how to give ai coding agent memory",
  "ai coding agent memory management",
  "local memory for ai agents",
  "tools for managing ai agent context",
  "ai agent memory tools",
  "memory architecture for ai agents",
  "ai coding workflow",
  "ai assisted development workflow",
  "structured ai development workflow",
  "ai coding pipeline tools",
  "ai development lifecycle tools",
  "ai driven software development workflow",
  "agent based development workflow",
  "ai programming workflow tools",
  "tools for cursor ai workflow",
  "cursor ai best practices tools",
  "cursor ai workflow management",
  "claude code memory tools",
  "claude coding agent tools",
  "tools for ai coding agents like cursor",
  "cursor ai cli tools",
  "why ai coding agents forget context",
  "why cursor ai forget instructions",
  "why claude code loses context",
  "how to stabilize ai coding agents",
  "how to prevent ai hallucination coding",
  "how to manage ai coding agent context",
  "how to improve ai coding reliability",
  "cli toolkit for ai coding agents",
  "persistent memory cli for ai agents",
  "workflow management for ai coding agents",
  "tools to manage cursor ai workflows",
  "tools to improve claude code reliability",
  "ai coding development lifecycle tools"
];

function slugifyKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function normalizeTitleCase(keyword: string): string {
  return keyword
    .trim()
    .split(/\s+/)
    .map((word) => {
      const lower = word.toLowerCase();
      if (titleCaseOverrides[lower]) {
        return titleCaseOverrides[lower];
      }
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    })
    .join(" ");
}

function buildEntries(keywords: string[]): SeoKeywordEntry[] {
  const seen = new Set<string>();
  const entries: SeoKeywordEntry[] = [];

  keywords.forEach((keyword) => {
    const baseSlug = slugifyKeyword(keyword);
    if (!baseSlug || seen.has(baseSlug)) {
      return;
    }

    seen.add(baseSlug);
    entries.push({
      keyword: normalizeTitleCase(keyword),
      slug: baseSlug,
    });
  });

  return entries;
}

export const seoKeywordEntries = buildEntries(rawSeoKeywords);

export function findSeoKeywordBySlug(slug: string): SeoKeywordEntry | null {
  return seoKeywordEntries.find((entry) => entry.slug === slug) ?? null;
}
