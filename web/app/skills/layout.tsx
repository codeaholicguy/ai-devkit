import type { Metadata } from "next";

export const metadata: Metadata = {
  title:
    "AI Agent Skills for a Repeatable Engineering Workflow",
  description:
    "Browse reusable AI agent skills for planning, memory, verification, debugging, testing, and review. Build agents with reusable behavior instead of rewriting prompts every time.",
  openGraph: {
    title:
      "AI Agent Skills for a Repeatable Engineering Workflow",
    description:
      "Browse reusable AI agent skills for planning, memory, verification, debugging, testing, and review. Build agents with reusable behavior instead of rewriting prompts every time.",
    url: "https://ai-devkit.com/skills",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title:
      "AI Agent Skills for a Repeatable Engineering Workflow",
    description:
      "Browse reusable AI agent skills for planning, memory, verification, debugging, testing, and review. Build agents with reusable behavior instead of rewriting prompts every time.",
  },
};

export default function SkillsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
