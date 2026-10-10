import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSlug from 'rehype-slug';
import rehypeSanitize from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import { visit } from 'unist-util-visit';
import type { Root, Element, RootContent } from 'hast';

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function text(node: RootContent): string {
  if (node.type === 'text') return node.value;
  return 'children' in node ? node.children.map(text).join('') : '';
}
export async function renderMarkdown(source: string) {
  const headings: { id: string; text: string; depth: number }[] = [];
  const file = await unified().use(remarkParse).use(remarkGfm).use(remarkRehype)
    .use(rehypeSlug).use(rehypeSanitize)
    .use(() => (tree: Root) => {
      visit(tree, 'element', (node: Element) => {
        if (/^h[23]$/.test(node.tagName)) headings.push({ id: String(node.properties.id), text: text(node), depth: Number(node.tagName[1]) });
        if (node.tagName === 'img') node.properties.loading = 'lazy';
        if (node.tagName === 'a' && /^https?:\/\//.test(String(node.properties.href))) node.properties.rel = ['noopener', 'noreferrer'];
      });
    }).use(rehypeStringify).process(source);
  return { html: String(file), headings };
}
