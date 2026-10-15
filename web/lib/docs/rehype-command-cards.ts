/**
 * Wrap each `### \`ai-devkit …\`` heading and the content under it
 * (until the next h1-h3) in a <section class="command-card">, so command
 * references render as cards without changing the Markdown.
 */

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

const BREAKING_HEADINGS = new Set(['h1', 'h2', 'h3']);

function textOf(node: HastNode): string {
  if (node.type === 'text') return node.value ?? '';
  return (node.children ?? []).map(textOf).join('');
}

function isCommandHeading(node: HastNode): boolean {
  if (node.type !== 'element' || node.tagName !== 'h3') return false;
  const first = (node.children ?? []).find(
    (child) => !(child.type === 'text' && !child.value?.trim()),
  );
  return (
    first?.type === 'element' &&
    first.tagName === 'code' &&
    textOf(first).trim().startsWith('ai-devkit ')
  );
}

export default function rehypeCommandCards() {
  return (tree: HastNode) => {
    const children = tree.children ?? [];
    const result: HastNode[] = [];
    let index = 0;

    while (index < children.length) {
      const node = children[index];
      if (!isCommandHeading(node)) {
        result.push(node);
        index += 1;
        continue;
      }

      const body: HastNode[] = [];
      index += 1;
      while (index < children.length) {
        const next = children[index];
        if (next.type === 'element' && BREAKING_HEADINGS.has(next.tagName ?? '')) break;
        body.push(next);
        index += 1;
      }

      result.push({
        type: 'element',
        tagName: 'section',
        properties: { className: ['command-card'] },
        children: [
          node,
          {
            type: 'element',
            tagName: 'div',
            properties: { className: ['command-card-body'] },
            children: body,
          },
        ],
      });
    }

    tree.children = result;
  };
}
