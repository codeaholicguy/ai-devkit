import matter from "gray-matter";

/**
 * Extract skill description from SKILL.md frontmatter
 * @param content - Content of SKILL.md file
 * @returns Description from frontmatter or first non-empty paragraph
 */
export function extractSkillDescription(content: string): string {
  try {
    const parsed = matter(content);

    // Try to get description from frontmatter
    if (parsed.data && parsed.data.description) {
      return String(parsed.data.description).trim();
    }

    // Fallback: use first non-empty paragraph from content
    const lines = parsed.content.split("\n").filter((l: string) => l.trim() && !l.startsWith("#"));

    return lines[0]?.trim() || "No description available";
  } catch (ignoreError) {
    // If parsing fails, return fallback
    return "No description available";
  }
}
