import type { Metadata } from "next";

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
  return children;
}
