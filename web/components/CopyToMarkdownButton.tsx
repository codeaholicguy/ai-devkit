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
            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 hover:text-black transition-colors focus:outline-none focus:ring-2 focus:ring-black focus:ring-offset-1"
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
                        className="w-4 h-4 text-green-600"
                    >
                        <polyline points="20 6 9 17 4 12" />
                    </svg>
                    <span className="text-green-600">Copied!</span>
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
