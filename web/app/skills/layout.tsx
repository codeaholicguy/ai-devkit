import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Explore Skills - AI DevKit",
    description:
        "Browse and search through hundreds of skills available for AI DevKit. Find the perfect skills to enhance your AI coding agents.",
    openGraph: {
        title: "Explore Skills - AI DevKit",
        description:
            "Browse and search through hundreds of skills available for AI DevKit. Find the perfect skills to enhance your AI coding agents.",
        url: "https://ai-devkit.com/skills",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Explore Skills - AI DevKit",
        description:
            "Browse and search through hundreds of skills available for AI DevKit. Find the perfect skills to enhance your AI coding agents.",
    },
};

export default function SkillsLayout({ children }: { children: React.ReactNode }) {
    return children;
}
