export type SeoCluster =
  | "memory"
  | "debugging"
  | "skills"
  | "agents"
  | "setup"
  | "workflow"
  | "overview";

export interface SeoKeywordEntry {
  keyword: string;
  slug: string;
  cluster: SeoCluster;
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
  md: "MD",
  devkit: "DevKit",
  os: "OS",
  bmad: "BMAD",
  superclaude: "SuperClaude",
  opencode: "opencode",
  "agents.md": "AGENTS.md",
  "claude.md": "CLAUDE.md",
};

// Lowercase mid-title, matching the docs' title style ("Development with AI DevKit").
const minorWords = new Set([
  "a", "an", "and", "as", "at", "but", "by", "for", "in", "of", "on", "or", "the", "to", "with",
]);

const rawSeoKeywords = [
  // Brand and category-defining
  "AI agent control plane",
  "AI coding agent control plane",
  "control plane for AI coding agents",
  "multi agent orchestration",
  "multi agent coding tools",
  "AI agent orchestration tools",
  "AI agent orchestration CLI",
  "tools for managing multiple AI coding agents",
  "how to manage multiple AI coding agents",
  "run Claude Code and Codex together",
  "share context between AI coding agents",
  "AI coding agent session management",
  // Agent memory and context
  "AI coding agent memory tools",
  "memory system for AI coding agents",
  "persistent memory for AI agents",
  "CLI memory for AI agents",
  "how to give AI coding agent memory",
  "AI coding agent memory management",
  "local memory for AI agents",
  "tools for managing AI agent context",
  "Claude Code persistent memory",
  "persistent memory for Claude Code",
  "persistent memory for Cursor",
  "why AI coding agents forget context",
  "why Cursor AI forgets instructions",
  "why Claude Code loses context",
  "how to make Claude Code remember",
  // Agent configuration and rules files
  "AGENTS.md generator",
  "AGENTS.md best practices",
  "CLAUDE.md best practices",
  "CLAUDE.md vs AGENTS.md",
  "Cursor rules management",
  "how to customize AI coding assistants with rules",
  "AI coding tools for enforcing coding standards",
  // Workflow and lifecycle
  "AI coding workflow",
  "structured AI development workflow",
  "AI development lifecycle tools",
  "spec driven development tools",
  "spec-driven development AI tools",
  "AI coding pipeline tools",
  "agent based development workflow",
  "AI programming workflow tools",
  "workflow management for AI coding agents",
  "AI coding development lifecycle tools",
  "context engineering tools",
  "context engineering for AI coding agents",
  // Skills
  "AI agent skill management",
  "Claude Code skills",
  "Claude Code skills manager",
  "AI coding agent skills",
  // Reliability and debugging
  "how to stabilize AI coding agents",
  "how to prevent AI hallucination coding",
  "how to improve AI coding reliability",
  "tools to improve Claude Code reliability",
  "AI coding assistant for debugging",
  "AI coding assistant for code review",
  "AI coding tools for reducing code review time",
  // Tool-specific workflows
  "tools for Claude Code workflow",
  "tools for Cursor workflow",
  "tools for Codex workflow",
  "tools for opencode workflow",
  "tools for Gemini CLI workflow",
  "Claude Code workflow tools",
  "Cursor workflow tools",
  "Codex workflow tools",
  "Cursor AI workflow management",
  // General tool discovery
  "best AI coding tools",
  "AI coding tools for developers",
  "AI coding tools for teams",
  "best AI coding tools for teams",
  "AI coding tools for large codebases",
  "AI coding tools with memory",
  "AI coding tools with project memory",
  "AI coding tools with CLI support",
  "AI coding tools for monorepos",
  "AI coding toolkit CLI",
  "CLI toolkit for AI coding agents",
  "AI coding tools for large legacy codebases",
  "AI coding tools comparison",
  "AI coding assistant for terminal",
  "AI development tools for engineers",
  // Alternatives and comparisons
  "AI DevKit vs Spec Kit",
  "AI DevKit vs Superpowers",
  "AI DevKit vs SuperClaude",
  "AI DevKit vs Agent OS",
  "AI DevKit vs BMAD",
  "Spec Kit alternative",
  "SuperClaude alternative",
  "Agent OS alternative",
];

const clusterRules: Array<{ cluster: SeoCluster; pattern: RegExp }> = [
  {
    cluster: "memory",
    pattern: /memory|forget|context|remember|persist|loses-context/,
  },
  { cluster: "debugging", pattern: /debug|hallucinat|reliab|stabilize/ },
  { cluster: "skills", pattern: /skill/ },
  {
    cluster: "agents",
    pattern:
      /control-plane|orchestrat|multi-agent|multiple-ai|session|agent-send|agent-console|share-context|together/,
  },
  {
    cluster: "setup",
    pattern:
      /cursor|claude-code|codex|opencode|gemini|copilot|junie|cline|antigravity|grok|vscode|terminal|agents-md|claude-md|rules/,
  },
  {
    cluster: "workflow",
    pattern: /workflow|lifecycle|pipeline|sdlc|spec|standards|monorepo|review/,
  },
];

export function resolveSeoCluster(slug: string): SeoCluster {
  for (const rule of clusterRules) {
    if (rule.pattern.test(slug)) {
      return rule.cluster;
    }
  }
  return "overview";
}

export const clusterDocSlugs: Record<SeoCluster, string> = {
  memory: "6-memory",
  debugging: "4-debugging-with-ai-devkit",
  skills: "7-skills",
  agents: "8-agent-management",
  setup: "2-supported-agents",
  workflow: "3-development-with-ai-devkit",
  overview: "0-what-is-ai-devkit",
};

interface SeoRelatedLink {
  href: string;
  label: string;
}

const clusterRelatedLinks: Record<SeoCluster, SeoRelatedLink[]> = {
  memory: [
    { href: "/docs/6-memory", label: "Give agents local long-term memory" },
    { href: "/faq/claude-code-persistent-memory", label: "Persistent memory for Claude Code" },
    { href: "/skills/memory", label: "The memory skill" },
    { href: "/docs/11-configuration-file", label: "Configure the memory database path" },
  ],
  debugging: [
    { href: "/docs/4-debugging-with-ai-devkit", label: "Structured debugging workflow" },
    { href: "/skills/structured-debug", label: "The structured-debug skill" },
    { href: "/skills/verify", label: "Verification before done" },
    { href: "/skills/security-review", label: "The security-review skill" },
  ],
  skills: [
    { href: "/skills", label: "Browse the skills registry" },
    { href: "/docs/7-skills", label: "Install and manage skills" },
    { href: "/skills/dev-lifecycle", label: "The dev-lifecycle skill" },
    { href: "/docs/1-getting-started", label: "Getting started" },
  ],
  agents: [
    { href: "/docs/8-agent-management", label: "Agent management commands" },
    { href: "/docs/13-agent-console", label: "The agent console" },
    {
      href: "/faq/use-ai-devkit-agent-send-wait-for-programmatic-agent-calls",
      label: "Programmatic agent calls with agent send",
    },
    { href: "/docs/2-supported-agents", label: "Supported agents and environments" },
  ],
  setup: [
    { href: "/docs/2-supported-agents", label: "Supported agents and environments" },
    { href: "/docs/1-getting-started", label: "The two-step setup" },
    { href: "/docs/9-agent-setup", label: "Project init and install" },
    { href: "/docs/11-configuration-file", label: "The .ai-devkit.json configuration file" },
  ],
  workflow: [
    { href: "/docs/3-development-with-ai-devkit", label: "Development workflow with AI DevKit" },
    { href: "/docs/10-dev-lifecycle-skill", label: "The dev-lifecycle phases" },
    { href: "/skills/dev-requirements", label: "The dev-requirements skill" },
    { href: "/skills/dev-review", label: "The dev-review skill" },
  ],
  overview: [
    { href: "/docs/0-what-is-ai-devkit", label: "What is AI DevKit?" },
    { href: "/docs/1-getting-started", label: "Getting started" },
    { href: "/skills", label: "Browse AI coding agent skills" },
    { href: "/vision", label: "The AI DevKit vision" },
  ],
};

export function getSeoClusterLinks(cluster: SeoCluster): SeoRelatedLink[] {
  return clusterRelatedLinks[cluster];
}

function slugifyKeyword(keyword: string): string {
  return keyword
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function capitalizeWord(word: string): string {
  const lower = word.toLowerCase();
  if (titleCaseOverrides[lower]) {
    return titleCaseOverrides[lower];
  }
  // Hyphenated words capitalize each part: "Spec-Driven".
  return lower
    .split("-")
    .map((part) => titleCaseOverrides[part] ?? `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("-");
}

function normalizeTitleCase(keyword: string): string {
  return keyword
    .trim()
    .split(/\s+/)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && minorWords.has(lower)) {
        return lower;
      }
      return capitalizeWord(word);
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
      cluster: resolveSeoCluster(baseSlug),
    });
  });

  return entries;
}

export const seoKeywordEntries = buildEntries(rawSeoKeywords);

export function findSeoKeywordBySlug(slug: string): SeoKeywordEntry | null {
  return seoKeywordEntries.find((entry) => entry.slug === slug) ?? null;
}
