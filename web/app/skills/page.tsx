"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { builtInSkills } from "@/lib/skills/built-in";

interface Skill {
    name: string;
    registry: string;
    path: string;
    description: string;
    lastIndexed: number;
}

interface SkillIndex {
    meta: {
        version: number;
        createdAt: number;
        updatedAt: number;
    };
    skills: Skill[];
}

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState<T>(value);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);

    return debouncedValue;
}

export default function SkillsPage() {
    const [skills, setSkills] = useState<Skill[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedSkill, setSelectedSkill] = useState<Skill | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false)
    const debouncedSearchQuery = useDebounce(searchQuery, 200);

    useEffect(() => {
        fetchSkills();
    }, []);

    async function fetchSkills() {
        try {
            setIsLoading(true);
            setError(null);
            const response = await fetch(
                "https://raw.githubusercontent.com/codeaholicguy/ai-devkit/main/skills/index.json"
            );
            if (!response.ok) {
                throw new Error("Failed to fetch skills");
            }
            const data: SkillIndex = await response.json();
            setSkills(data.skills);
        } catch (err) {
            setError(err instanceof Error ? err.message : "An error occurred");
        } finally {
            setIsLoading(false);
        }
    }

    const filteredSkills = useMemo(() => {
        return skills.filter(
            (skill) =>
                skill.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                skill.description.toLowerCase().includes(debouncedSearchQuery.toLowerCase())
        );
    }, [skills, debouncedSearchQuery]);

    const handleCopy = async (skillName: string) => {
        try {
            await navigator.clipboard.writeText(`npx ai-devkit@latest skill add ${skillName}`);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch {
            // Clipboard API not available - user can manually copy
        }
    };

    const closeModal = useCallback(() => {
        setSelectedSkill(null);
        setCopied(false);
    }, []);

    useEffect(() => {
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                closeModal();
            }
        };
        if (selectedSkill) {
            document.addEventListener("keydown", handleEscape);
            return () => document.removeEventListener("keydown", handleEscape);
        }
    }, [selectedSkill, closeModal]);

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://ai-devkit.com";
    const structuredData = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        name: "AI Coding Agent Skills",
        description:
            "Browse reusable AI coding agent skills for Claude Code, Codex, Cursor, opencode, Gemini CLI, and other supported coding agents.",
        url: `${siteUrl}/skills/`,
        isPartOf: {
            "@type": "WebSite",
            name: "AI DevKit",
            url: siteUrl,
        },
        about: [
            "AI coding agent skills",
            "Claude Code skills",
            "Codex skills",
            "Cursor skills",
            "opencode skills",
            "Gemini CLI skills",
        ],
        hasPart: builtInSkills.map((skill) => ({
            "@type": "TechArticle",
            name: `${skill.title} Skill`,
            description: skill.summary,
            url: `${siteUrl}/skills/${skill.name}/`,
        })),
    };

    return (
        <div className="bg-white min-h-screen">
            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
            />
            {/* Header */}
            <section className="mx-auto max-w-7xl px-4 py-10 sm:px-6 md:py-14 lg:px-8">
                <div className="text-center mb-8">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Browse AI Coding Agent Skills</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Find reusable skills for Claude Code, Codex, Cursor, opencode, Gemini CLI, and other
                        coding agents. Search{" "}
                        {skills.length > 0 ? skills.length.toLocaleString() : "hundreds of"} skills available
                        for AI DevKit, then click any skill to get the install command.
                    </p>
                </div>

                <section className="mb-10 border-y border-gray-200 py-6">
                    <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h2 className="text-xl font-bold">Built-in AI DevKit skills</h2>
                            <p className="mt-1 max-w-3xl text-sm text-gray-600">
                                Start with workflow, debugging, testing, review, memory, documentation, and
                                multi-agent skills that ship with AI DevKit.
                            </p>
                        </div>
                        <Link href="/docs/7-skills" className="text-sm font-semibold text-black underline">
                            Learn how skills work
                        </Link>
                    </div>
                    <div className="relative">
                        <div
                            className="flex gap-3 overflow-x-auto pb-2 pr-10"
                            aria-label="Built-in AI DevKit skills"
                        >
                            {builtInSkills.map((skill) => {
                                const isRecommended = skill.name === "dev-lifecycle";
                                return (
                                    <Link
                                        key={skill.name}
                                        href={`/skills/${skill.name}`}
                                        className={`group block w-64 flex-none rounded-lg border p-4 no-underline transition-colors hover:border-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 ${
                                            isRecommended
                                                ? "border-black bg-gray-50"
                                                : "border-gray-200 bg-white"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <h3 className="min-w-0 text-sm font-semibold leading-5 text-gray-950 group-hover:text-black">
                                                {skill.title}
                                            </h3>
                                            <span className="flex-none text-xs text-gray-500">
                                                {isRecommended ? "Recommended" : skill.category}
                                            </span>
                                        </div>
                                        <p className="mt-2 line-clamp-2 text-sm leading-6 text-gray-600">
                                            {skill.summary}
                                        </p>
                                    </Link>
                                );
                            })}
                        </div>
                        <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-white to-transparent" />
                    </div>
                </section>

                {/* Search Input */}
                <div className="max-w-xl mx-auto mb-12">
                    <div className="mb-3 text-center">
                        <h2 className="text-xl font-bold">Search the Registry</h2>
                        <p className="mt-1 text-sm text-gray-600">
                            Find skills by name, workflow, registry, or capability.
                        </p>
                    </div>
                    <div className="relative">
                        <input
                            type="text"
                            name="skill-search"
                            autoComplete="off"
                            placeholder="Search skills by name or description…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full rounded-lg border border-gray-300 px-5 py-4 text-lg transition-shadow focus-visible:border-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                            aria-label="Search skills"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                                aria-label="Clear search"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                    <p className="mt-3 text-center text-sm text-gray-500">
                        Works with Claude Code, Codex, Cursor, opencode, Gemini CLI, GitHub Copilot, Cline, Devin,
                        Kilo Code, and Roo Code.
                    </p>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="text-center py-20">
                        <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
                        <p className="mt-4 text-gray-600">Loading skills…</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="text-center py-20">
                        <p className="text-red-600 mb-4">{error}</p>
                        <button
                            onClick={fetchSkills}
                            className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                        >
                            Try Again
                        </button>
                    </div>
                )}

                {/* Skills Grid */}
                {!isLoading && !error && (
                    <>
                        {filteredSkills.length === 0 ? (
                            <div className="text-center py-20">
                                <p className="text-gray-600 text-lg">
                                    {`No skills found matching "${debouncedSearchQuery}"`}
                                </p>
                                <button
                                    onClick={() => setSearchQuery("")}
                                    className="mt-4 text-black underline hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black"
                                >
                                    Clear search
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {filteredSkills.map((skill) => (
                                    <button
                                        key={`${skill.registry}-${skill.name}`}
                                        onClick={() => setSelectedSkill(skill)}
                                        className="group rounded-lg border border-gray-200 bg-gray-50 p-6 text-left transition-colors hover:border-black hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2 [contain-intrinsic-size:180px] [content-visibility:auto]"
                                    >
                                        <h3 className="text-lg font-semibold mb-2 group-hover:text-black">
                                            {skill.name}
                                        </h3>
                                        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{skill.description}</p>
                                        <span className="text-xs text-gray-400 font-mono">{skill.registry}</span>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Results count */}
                        {filteredSkills.length > 0 && (
                            <p className="text-center text-gray-500 mt-8">
                                Showing {filteredSkills.length.toLocaleString()} of {skills.length.toLocaleString()}{" "}
                                skills
                            </p>
                        )}
                    </>
                )}
            </section>

            {/* Modal */}
            {selectedSkill && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center overscroll-contain bg-black/50 p-4"
                    onClick={closeModal}
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="skill-dialog-title"
                >
                    <div
                        className="max-h-[90vh] w-full max-w-lg overflow-hidden rounded-lg border border-gray-200 bg-white shadow-xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="relative">
                            <div className="p-6 pb-5">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h2 id="skill-dialog-title" className="text-2xl font-bold tracking-tight">
                                            {selectedSkill.name}
                                        </h2>
                                        <span className="inline-flex items-center mt-2 px-3 py-1 bg-gray-100 text-gray-600 text-xs font-mono rounded-full">
                                            {selectedSkill.registry}
                                        </span>
                                    </div>
                                    <button
                                        onClick={closeModal}
                                        className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                                        aria-label="Close modal"
                                    >
                                        <svg
                                            className="w-5 h-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
                                            aria-hidden="true"
                                        >
                                            <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                strokeWidth={2}
                                                d="M6 18L18 6M6 6l12 12"
                                            />
                                        </svg>
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="max-h-[50vh] overflow-y-auto px-6 pb-6">
                            <div className="space-y-6">
                                <div>
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                        Description
                                    </h3>
                                    <p className="text-gray-600 leading-relaxed">{selectedSkill.description}</p>
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                                        Install Command
                                    </h3>
                                    <div className="group relative">
                                        <div className="flex items-stretch overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
                                            <code className="flex-1 px-4 py-4 font-mono text-sm text-gray-800 overflow-x-auto">
                                                npx ai-devkit@latest skill add {selectedSkill.registry} {selectedSkill.name}
                                            </code>
                                            <button
                                                onClick={() => handleCopy(selectedSkill.registry + " " + selectedSkill.name)}
                                                className="flex items-center gap-2 bg-black px-5 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
                                                aria-live="polite"
                                            >
                                                {copied ? (
                                                    <>
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                            aria-hidden="true"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M5 13l4 4L19 7"
                                                            />
                                                        </svg>
                                                        Copied
                                                    </>
                                                ) : (
                                                    <>
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
                                                            aria-hidden="true"
                                                        >
                                                            <path
                                                                strokeLinecap="round"
                                                                strokeLinejoin="round"
                                                                strokeWidth={2}
                                                                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                                            />
                                                        </svg>
                                                        Copy
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
