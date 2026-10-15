import type { Metadata } from "next";
import SearchProvider from "@/components/docs/SearchProvider";
import { DOC_SECTIONS } from "@/lib/docs/sections";

const QUICK_LINKS = [
  { title: "Dev Lifecycle Skill", href: "/skills/dev-lifecycle" },
  { title: "Skills docs", href: "/docs/7-skills" },
  { title: "Getting Started", href: "/docs/1-getting-started" },
];

export const metadata: Metadata = {
  title: "Browse AI Coding Agent Skills for Claude Code, Codex, Cursor, and More",
  description:
    "Browse reusable AI coding agent skills for Claude Code, Codex, Cursor, opencode, and Gemini CLI. Find AI DevKit built-in skills, install commands, and workflow skills for planning, debugging, testing, review, and memory.",
  keywords: [
    "AI coding agent skills",
    "AI DevKit skills",
    "Claude Code skills",
    "Codex skills",
    "Cursor skills",
    "opencode skills",
    "Gemini CLI skills",
    "agent workflow skills",
  ],
  alternates: {
    canonical: "https://ai-devkit.com/skills/",
  },
  openGraph: {
    title: "Browse AI Coding Agent Skills for Claude Code, Codex, Cursor, and More | AI DevKit",
    description:
      "Browse reusable AI coding agent skills for Claude Code, Codex, Cursor, opencode, and Gemini CLI. Find AI DevKit built-in skills, install commands, and workflow skills for planning, debugging, testing, review, and memory.",
    url: "https://ai-devkit.com/skills/",
    siteName: "AI DevKit",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Browse AI Coding Agent Skills for Claude Code, Codex, Cursor, and More | AI DevKit",
    description:
      "Browse reusable AI coding agent skills for Claude Code, Codex, Cursor, opencode, and Gemini CLI. Find AI DevKit built-in skills, install commands, and workflow skills for planning, debugging, testing, review, and memory.",
  },
};

export default function SkillsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Skills pages share the docs reading surface, theme, and ⌘K search.
  return (
    <div className="page-docs page-skills">
      <SearchProvider
        quickLinks={QUICK_LINKS}
        sections={DOC_SECTIONS.map(({ id, title }) => ({ id, title }))}
      >
        {children}
      </SearchProvider>
    </div>
  );
}
