import type { XmlNode } from '../types/xmlNode';
import { parseXml } from './parseXml';
import { serializeXml } from './serializeXml';

export interface FidelityReport {
  elements: number;
  attributes: number;
  textNodes: number;
  totalNodes: number;
  /** Node count after `serialize -> parse`. Equal to `totalNodes` if lossless. */
  nodesAfterRoundTrip: number;
  /** `totalNodes - nodesAfterRoundTrip`. Zero when nothing was lost. */
  dropped: number;
  /** True when the round-tripped tree is deeply identical to the original. */
  roundTripOk: boolean;
}

/**
 * Measure what survived the parse, by actually re-deriving it.
 *
 * The "0 dropped" claim is computed, not asserted: the tree is serialized back
 * to XML, re-parsed, and compared. Everything here is derived from node shape —
 * no tag name is inspected.
 */
export function checkFidelity(tree: XmlNode): FidelityReport {
  const before = countNodes(tree);

  let nodesAfterRoundTrip = 0;
  let roundTripOk: boolean;
  try {
    const reparsed = parseXml(serializeXml(tree));
    nodesAfterRoundTrip = countNodes(reparsed).totalNodes;
    // Key order is fixed by how nodes are constructed, so this is a safe
    // structural comparison and far cheaper than a recursive deep-equal.
    roundTripOk = JSON.stringify(reparsed) === JSON.stringify(tree);
  } catch {
    // A tree that cannot be re-parsed is, by definition, not round-tripping.
    roundTripOk = false;
  }

  return {
    ...before,
    nodesAfterRoundTrip,
    dropped: before.totalNodes - nodesAfterRoundTrip,
    roundTripOk,
  };
}

function countNodes(node: XmlNode): {
  elements: number;
  attributes: number;
  textNodes: number;
  totalNodes: number;
} {
  let elements = 0;
  let attributes = 0;
  let textNodes = 0;
  let totalNodes = 0;

  const walk = (n: XmlNode): void => {
    totalNodes += 1;
    if (n.kind === 'element') {
      elements += 1;
      attributes += n.attributes.length;
      n.children.forEach(walk);
    } else if (n.kind === 'text' && n.value.trim() !== '') {
      textNodes += 1;
    }
  };

  walk(node);
  return { elements, attributes, textNodes, totalNodes };
}

export interface VocabularyEntry {
  name: string;
  count: number;
}

/**
 * Every distinct element name in the document, with how often it occurs.
 *
 * This is the evidence that nothing was filtered: the reader sees the complete
 * vocabulary the file actually contains, including names this project has never
 * heard of. It is built by walking the tree, so it cannot go out of date and
 * cannot omit a name the code does not recognise — there is no list to miss.
 *
 * Sorted by frequency, then alphabetically.
 */
export function collectVocabulary(tree: XmlNode): VocabularyEntry[] {
  const counts = new Map<string, number>();

  const walk = (n: XmlNode): void => {
    if (n.kind !== 'element') return;
    counts.set(n.name, (counts.get(n.name) ?? 0) + 1);
    n.children.forEach(walk);
  };

  walk(tree);

  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}
