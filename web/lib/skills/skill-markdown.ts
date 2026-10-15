import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { REPO_URL } from '../utils';

// Built-in skills live at the repo root, next to web/.
const skillsDirectory = path.join(process.cwd(), '..', 'skills');

const FENCE = /^\s*(```|~~~)/;
const EXTERNAL_LINK = /^(https?:|mailto:|#|\/)/;

/** Escape "<" outside inline code so placeholders like <name> render as text. */
function escapeOutsideInlineCode(line: string): string {
  return line
    .split(/(`+[^`]*`+)/)
    .map((part, index) => (index % 2 === 1 ? part : part.replace(/</g, '&lt;')))
    .join('');
}

/**
 * Read a built-in skill's SKILL.md and prepare it to sit inside the skill page:
 * drop the frontmatter and its own h1, demote headings one level, escape
 * placeholders, and point relative links at the file on GitHub.
 */
export function getSkillMarkdown(name: string): string | null {
  const filePath = path.join(skillsDirectory, name, 'SKILL.md');
  if (!fs.existsSync(filePath)) return null;

  const { content } = matter(fs.readFileSync(filePath, 'utf8'));
  const lines: string[] = [];
  let fence: string | null = null;
  let droppedTitle = false;

  for (const line of content.split('\n')) {
    const fenceMatch = line.match(FENCE);
    if (fenceMatch) {
      if (fence === null) fence = fenceMatch[1];
      else if (fenceMatch[1] === fence) fence = null;
      lines.push(line);
      continue;
    }
    if (fence !== null) {
      lines.push(line);
      continue;
    }
    if (!droppedTitle && /^#\s+/.test(line)) {
      droppedTitle = true;
      continue;
    }

    let next = line.replace(/^(#{1,5})(\s+)/, '#$1$2');
    next = escapeOutsideInlineCode(next);
    next = next.replace(/\]\(([^)\s]+)\)/g, (match, target: string) =>
      EXTERNAL_LINK.test(target) || target.startsWith('&lt;')
        ? match
        : `](${REPO_URL}/blob/main/skills/${name}/${target})`,
    );
    lines.push(next);
  }

  return lines.join('\n').trim();
}
