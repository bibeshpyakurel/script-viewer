import type { XmlNode } from '../types/xmlNode';

/**
 * Turn an {@link XmlNode} tree back into an XML string.
 *
 * This exists to PROVE fidelity, not as a user-facing feature. It is the second
 * half of the round-trip check: if `parse -> serialize -> parse` yields a tree
 * deeply equal to the first, the parser dropped nothing structural.
 *
 * Like the parser, it is generic — it switches on `kind` and never on a name.
 */
export function serializeXml(node: XmlNode): string {
  switch (node.kind) {
    case 'element': {
      const attrs = node.attributes
        .map((a) => ` ${a.name}="${escapeAttribute(a.value)}"`)
        .join('');
      // Self-closing when empty. `<a/>` and `<a></a>` re-parse to the same
      // node, so either is faithful; the short form matches the fixture.
      return node.children.length === 0
        ? `<${node.name}${attrs}/>`
        : `<${node.name}${attrs}>${node.children.map(serializeXml).join('')}</${node.name}>`;
    }
    case 'text':
      return escapeText(node.value);
    case 'cdata':
      return `<![CDATA[${node.value}]]>`;
    case 'comment':
      return `<!--${node.value}-->`;
    case 'pi':
      return node.data
        ? `<?${node.target} ${node.data}?>`
        : `<?${node.target}?>`;
  }
}

/** `&` must be replaced first, or it would double-escape the entities below. */
function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Attribute values additionally cannot contain the quote that delimits them. */
function escapeAttribute(value: string): string {
  return escapeText(value).replace(/"/g, '&quot;');
}
