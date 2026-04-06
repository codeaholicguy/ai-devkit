import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "AI Agent Skills That Make Your Agents Work Like Real Engineers",
  description:
    "Browse reusable AI agent skills for structured coding workflows, testing, debugging, and code review. Build agents with reusable commands instead of rewriting prompts every time.",
  openGraph: {
    title:
      "AI Agent Skills That Make Your Agents Work Like Real Engineers",
    description:
      "Browse reusable AI agent skills for structured coding workflows, testing, debugging, and code review. Build agents with reusable commands instead of rewriting prompts every time.",
    url: "https://ai-devkit.com/skills",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "AI Agent Skills That Make Your Agents Work Like Real Engineers",
    description:
      "Browse reusable AI agent skills for structured coding workflows, testing, debugging, and code review. Build agents with reusable commands instead of rewriting prompts every time.",
  },
};

export default function SkillsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
