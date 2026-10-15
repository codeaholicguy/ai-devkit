"use client";

import { useState } from "react";

interface CopyToMarkdownButtonProps {
    content: string;
    title: string;
}

export default function CopyToMarkdownButton({
    content,
    title,
}: CopyToMarkdownButtonProps) {
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        try {
            // Create a more comprehensive markdown output including title
            const fullContent = `# ${title}\n\n${content}`;
            await navigator.clipboard.writeText(fullContent);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error("Failed to copy text: ", err);
        }
    };

    return (
        <button
            onClick={handleCopy}
            className="docs-action-button"
            aria-label="Copy to Markdown"
        >
            {copied ? (
                <>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span>Copied!</span>
                </>
            ) : (
                <>
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="w-4 h-4"
                    >
                        <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
                        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
                    </svg>
                    <span>Copy for AI</span>
                </>
            )}
        </button>
    );
}
