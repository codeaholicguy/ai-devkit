"use client";

import { useState, useEffect, useCallback, useMemo } from "react";

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

    return (
        <div className="bg-white min-h-screen">
            {/* Header */}
            <section className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12 md:py-20">
                <div className="text-center mb-12">
                    <h1 className="text-4xl md:text-5xl font-bold mb-4">Explore Skills</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Browse and search through{" "}
                        {skills.length > 0 ? skills.length.toLocaleString() : "hundreds of"} skills available
                        for AI DevKit. Click any skill to get the install command.
                    </p>
                </div>

                {/* Search Input */}
                <div className="max-w-xl mx-auto mb-12">
                    <div className="relative">
                        <input
                            type="text"
                            placeholder="Search skills by name or description..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full px-5 py-4 text-lg border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition-shadow"
                            aria-label="Search skills"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                aria-label="Clear search"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="text-center py-20">
                        <div className="inline-block w-8 h-8 border-4 border-gray-200 border-t-black rounded-full animate-spin"></div>
                        <p className="mt-4 text-gray-600">Loading skills...</p>
                    </div>
                )}

                {/* Error State */}
                {error && (
                    <div className="text-center py-20">
                        <p className="text-red-600 mb-4">{error}</p>
                        <button
                            onClick={fetchSkills}
                            className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800 transition-colors"
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
                                    className="mt-4 text-black underline hover:opacity-70"
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
                                        className="text-left p-6 bg-gray-50 border border-gray-200 rounded-lg hover:border-black hover:shadow-md transition-all group"
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
                    className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
                    onClick={closeModal}
                >
                    <div
                        className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-hidden shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        {/* Header */}
                        <div className="relative">
                            <div className="p-8 pb-6">
                                <div className="flex justify-between items-start gap-4">
                                    <div>
                                        <h2 className="text-2xl font-bold tracking-tight">{selectedSkill.name}</h2>
                                        <span className="inline-flex items-center mt-2 px-3 py-1 bg-gray-100 text-gray-600 text-xs font-mono rounded-full">
                                            {selectedSkill.registry}
                                        </span>
                                    </div>
                                    <button
                                        onClick={closeModal}
                                        className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                                        aria-label="Close modal"
                                    >
                                        <svg
                                            className="w-5 h-5"
                                            fill="none"
                                            stroke="currentColor"
                                            viewBox="0 0 24 24"
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
                        <div className="px-8 pb-8 max-h-[50vh] overflow-y-auto">
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
                                        <div className="flex items-stretch rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                                            <code className="flex-1 px-4 py-4 font-mono text-sm text-gray-800 overflow-x-auto">
                                                npx ai-devkit@latest skill add {selectedSkill.registry} {selectedSkill.name}
                                            </code>
                                            <button
                                                onClick={() => handleCopy(selectedSkill.registry + " " + selectedSkill.name)}
                                                className="px-5 bg-black text-white hover:bg-gray-800 transition-colors text-sm font-medium flex items-center gap-2"
                                            >
                                                {copied ? (
                                                    <>
                                                        <svg
                                                            className="w-4 h-4"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            viewBox="0 0 24 24"
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
