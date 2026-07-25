import {
  DOMParser,
  Node,
  type Element,
  type ProcessingInstruction,
} from '@xmldom/xmldom';
import type { XmlNode } from '../types/xmlNode';

/**
 * Parse an XML string into the uniform {@link XmlNode} tree.
 *
 * Nothing here knows the document's vocabulary. Every branch below switches on
 * `nodeType` — a fixed, spec-defined set of structural kinds — never on a tag
 * or attribute name. Names are copied as opaque strings, so an element or
 * attribute this code has never seen is carried through unchanged.
 */
export function parseXml(xml: string): XmlNode {
  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const root = doc.documentElement;
  // `documentElement` is nullable; a tree has to start somewhere.
  if (!root) throw new Error('XML contains no root element');
  return toXmlNode(root);
}

/** Convert one DOM node, recursing into its children. */
function toXmlNode(node: Node): XmlNode {
  switch (node.nodeType) {
    case Node.ELEMENT_NODE: {
      const el = node as Element;
      return {
        kind: 'element',
        // `tagName`, not `localName`: keeps any namespace prefix as written.
        name: el.tagName,
        // Spread preserves source order. `attr.name` keeps the prefix too, so
        // `xmlns:*` declarations survive as ordinary attributes.
        attributes: [...el.attributes].map((attr) => ({
          name: attr.name,
          value: attr.value,
        })),
        // An element with no children yields [], which is a real empty array,
        // not a missing field.
        children: [...el.childNodes].map(toXmlNode),
      };
    }

    // Whitespace-only text is KEPT. The indentation between elements is real
    // character data, and discarding it at parse time is irreversible. A view
    // that finds it noisy can filter while rendering; the tree stays faithful.
    case Node.TEXT_NODE:
      return { kind: 'text', value: node.nodeValue ?? '' };

    case Node.CDATA_SECTION_NODE:
      return { kind: 'cdata', value: node.nodeValue ?? '' };

    case Node.COMMENT_NODE:
      return { kind: 'comment', value: node.nodeValue ?? '' };

    case Node.PROCESSING_INSTRUCTION_NODE: {
      const pi = node as ProcessingInstruction;
      return { kind: 'pi', target: pi.target, data: pi.data };
    }

    // Throw rather than coerce. Silently turning an unmodelled node kind into
    // text would be exactly the quiet data loss this tree exists to prevent.
    default:
      throw new Error(`Unsupported XML node type: ${node.nodeType}`);
  }
}
