import { describe, expect, it } from 'vitest';
import { XmlParseError, parseXml } from './parseXml';
import { serializeXml } from './serializeXml';
import type {
  XmlDocumentNode,
  XmlElementNode,
  XmlNode,
} from '../types/xmlNode';
// `?raw` gives the fixture as an immutable string, the same way the app will
// load it. Nothing here can write back to the file.
import fixture from '../fixtures/sample-script.xml?raw';

/** True for the two kinds that have a `children` array. */
function hasChildren(node: XmlNode): node is XmlElementNode | XmlDocumentNode {
  return node.kind === 'element' || node.kind === 'document';
}

/**
 * The single root element of a parsed document.
 *
 * `parseXml` returns the DOCUMENT, not the root element, so that the prolog
 * survives. Tests that care about the root ask for it explicitly.
 */
function rootElement(node: XmlNode): XmlElementNode {
  if (node.kind !== 'document') throw new Error('expected a document node');
  const root = node.children.find(
    (c): c is XmlElementNode => c.kind === 'element',
  );
  if (!root) throw new Error('document has no root element');
  return root;
}

/** Direct element children, ignoring the whitespace text the parser keeps. */
function elementChildren(node: XmlNode): XmlElementNode[] {
  if (!hasChildren(node)) return [];
  return node.children.filter((c): c is XmlElementNode => c.kind === 'element');
}

/** First element with this name, anywhere in the tree. */
function findElement(node: XmlNode, name: string): XmlElementNode | undefined {
  if (node.kind === 'element' && node.name === name) return node;
  if (!hasChildren(node)) return undefined;
  for (const child of node.children) {
    const hit = findElement(child, name);
    if (hit) return hit;
  }
  return undefined;
}

/** Every element in the tree, in document order. */
function allElements(node: XmlNode): XmlElementNode[] {
  if (node.kind === 'document') return node.children.flatMap(allElements);
  if (node.kind !== 'element') return [];
  return [node, ...node.children.flatMap(allElements)];
}

function expectElement(node: XmlNode | undefined): XmlElementNode {
  expect(node).toBeDefined();
  if (node?.kind !== 'element') throw new Error('expected an element node');
  return node;
}

describe('the no-allowlist guarantee', () => {
  // Names chosen to exist nowhere in the supplied fixture. The assertions
  // below prove that, so this test cannot silently rot into a no-op if the
  // fixture ever changes.
  const NEW_ELEMENT = 'QuantumFlux';
  const NEW_ATTRIBUTE = 'resonanceIndex';
  const NEW_VALUE = '42';

  it('the "new" names really are absent from the fixture', () => {
    expect(fixture).not.toContain(NEW_ELEMENT);
    expect(fixture).not.toContain(NEW_ATTRIBUTE);
  });

  it('a never-before-seen element and attribute survive intact', () => {
    // Nest it inside the existing <Source>, between <ExportId> and
    // <ExportedAt>, so parent and sibling position are both meaningful.
    const modified = fixture.replace(
      '    <ExportedAt>',
      `    <${NEW_ELEMENT} ${NEW_ATTRIBUTE}="${NEW_VALUE}">new</${NEW_ELEMENT}>\n    <ExportedAt>`,
    );
    expect(modified).not.toBe(fixture);

    const root = parseXml(modified);
    const source = expectElement(findElement(root, 'Source'));
    const siblings = elementChildren(source);

    // Parent: it is a direct child of <Source>, not floating elsewhere.
    const added = siblings.filter((s) => s.name === NEW_ELEMENT);
    expect(added).toHaveLength(1);

    // Name survives exactly.
    expect(added[0]?.name).toBe(NEW_ELEMENT);

    // Attribute name and value survive exactly.
    expect(added[0]?.attributes).toEqual([
      { name: NEW_ATTRIBUTE, value: NEW_VALUE },
    ]);

    // Text content survives.
    expect(added[0]?.children).toEqual([{ kind: 'text', value: 'new' }]);

    // Position among its siblings survives, in document order.
    expect(siblings.map((s) => s.name)).toEqual([
      'System',
      'ExportId',
      NEW_ELEMENT,
      'ExportedAt',
    ]);
    expect(siblings.findIndex((s) => s.name === NEW_ELEMENT)).toBe(2);
  });
});

describe('same-name siblings', () => {
  it('parses three <Page> elements as three ordered children', () => {
    const root = parseXml(fixture);
    const pages = elementChildren(expectElement(findElement(root, 'Pages')));

    expect(pages).toHaveLength(3);
    expect(pages.every((p) => p.name === 'Page')).toBe(true);

    // Document order, not collapsed into one and not reordered.
    const ids = pages.map(
      (p) => p.attributes.find((a) => a.name === 'pageId')?.value,
    );
    expect(ids).toEqual([
      'training-page-caller-information',
      'training-page-call-reason',
      'training-page-confirm-close',
    ]);
    expect(
      pages.map((p) => p.attributes.find((a) => a.name === 'order')?.value),
    ).toEqual(['1', '2', '3']);
  });
});

describe('empty elements', () => {
  it('keeps a self-closing element as a real node with zero children', () => {
    const root = parseXml(fixture);
    const calc = expectElement(findElement(root, 'XmlCalcNode'));

    expect(calc.kind).toBe('element');
    expect(calc.children).toEqual([]);
    expect(calc.attributes).toEqual([]);
  });

  it('does not drop empty elements from the tree', () => {
    const root = parseXml(fixture);
    const names = allElements(root).map((e) => e.name);

    // 3 self-closing + 1 with an <Expr> child.
    expect(names.filter((n) => n === 'XmlCalcNode')).toHaveLength(4);
    // Every one of these appears only in self-closing form.
    expect(names.filter((n) => n === 'XmlSerializiationData')).toHaveLength(10);
    expect(names.filter((n) => n === 'XmlSharedActionsNode')).toHaveLength(1);
    expect(names.filter((n) => n === 'FieldRef')).toHaveLength(5);
  });
});

describe('attribute order and namespaces', () => {
  it('preserves the root attribute order, declarations included', () => {
    const root = rootElement(parseXml(fixture));

    expect(root.name).toBe('ScriptExport');
    expect(root.attributes).toEqual([
      { name: 'xmlns:xsi', value: 'http://www.w3.org/2001/XMLSchema-instance' },
      { name: 'xmlns:xsd', value: 'http://www.w3.org/2001/XMLSchema' },
      { name: 'schemaVersion', value: '1.0' },
      { name: 'environment', value: 'training' },
    ]);
  });

  it('keeps namespace prefixes on attribute names', () => {
    const root = parseXml(fixture);
    const anyType = expectElement(findElement(root, 'anyType'));

    // `xsi:type`, not `type` — the prefix is part of the name as written.
    expect(anyType.attributes[0]?.name).toBe('xsi:type');
    expect(anyType.attributes[0]?.value).toBe('DisplayElement');
  });

  it('keeps namespace prefixes on ELEMENT names too', () => {
    // Every element in the fixture is unprefixed, so the fixture alone cannot
    // prove the parser uses `tagName` rather than `localName`. This does.
    const root = rootElement(
      parseXml('<ns:Root xmlns:ns="u"><ns:Child ns:a="v" /></ns:Root>'),
    );

    expect(root.name).toBe('ns:Root');
    const child = root.children[0];
    if (child?.kind !== 'element') throw new Error('expected an element');
    expect(child.name).toBe('ns:Child');
    expect(child.attributes[0]?.name).toBe('ns:a');
  });

  it('retains a namespace declared but never used', () => {
    // The fixture declares xmlns:xsd and never references it. A parser that
    // recorded only namespaces in use would silently drop this.
    const root = rootElement(parseXml(fixture));
    expect(root.attributes.map((a) => a.name)).toContain('xmlns:xsd');
    expect(fixture).not.toContain('xsd:');
  });
});

describe('whitespace fidelity', () => {
  // The round-trip test CANNOT catch whitespace loss: if the parser dropped
  // whitespace-only text, serialize and re-parse would drop it consistently
  // and the trees would still match. This pins the decision explicitly.
  it('keeps whitespace-only text nodes rather than dropping them', () => {
    const root = rootElement(parseXml(fixture));

    const blankText = root.children.filter(
      (c) => c.kind === 'text' && c.value.trim() === '',
    );
    expect(blankText.length).toBeGreaterThan(0);

    // Indentation between the root's children is preserved verbatim.
    expect(root.children[0]).toEqual({ kind: 'text', value: '\n  ' });
  });

  it('keeps the exact indentation inside a nested element', () => {
    const root = parseXml(fixture);
    const vendor = expectElement(findElement(root, 'FutureVendorSetting'));

    expect(vendor.children.map((c) => c.kind)).toEqual([
      'text',
      'element',
      'text',
    ]);
    expect(vendor.children[0]).toEqual({
      kind: 'text',
      value: '\n                  ',
    });
  });
});

describe('the document prolog', () => {
  // Everything above the root element used to be discarded, because `parseXml`
  // returned the document ELEMENT. These pin the fix.
  it('captures the XML declaration that opens the supplied fixture', () => {
    const doc = parseXml(fixture);
    expect(doc.kind).toBe('document');

    const declaration = (doc as XmlDocumentNode).children.find(
      (c) => c.kind === 'pi',
    );
    expect(declaration).toEqual({
      kind: 'pi',
      target: 'xml',
      data: 'version="1.0" encoding="utf-8"',
    });
  });

  it('places the declaration before the root element, not inside it', () => {
    const doc = parseXml(fixture);
    if (doc.kind !== 'document') throw new Error('expected a document');

    const kinds = doc.children.map((c) => c.kind);
    expect(kinds.indexOf('pi')).toBeLessThan(kinds.indexOf('element'));
    // The declaration is a sibling of the root, never one of its children.
    expect(rootElement(doc).children.some((c) => c.kind === 'pi')).toBe(false);
  });

  it('re-emits the declaration when serialized', () => {
    // The first line of the supplied file survives a full round trip.
    expect(serializeXml(parseXml(fixture))).toContain(
      '<?xml version="1.0" encoding="utf-8"?>',
    );
  });

  it('keeps comments and processing instructions above the root', () => {
    const doc = parseXml(
      '<?xml version="1.0"?><!--lead--><?stylesheet href="s.xsl"?><r/>',
    );
    if (doc.kind !== 'document') throw new Error('expected a document');

    expect(doc.children.map((c) => c.kind)).toEqual([
      'pi',
      'comment',
      'pi',
      'element',
    ]);
  });

  it('keeps trailing nodes that follow the root element', () => {
    const doc = parseXml('<r/><!--after-->');
    if (doc.kind !== 'document') throw new Error('expected a document');

    expect(doc.children.map((c) => c.kind)).toEqual(['element', 'comment']);
  });

  it('still requires a root element', () => {
    // A prolog alone is not a document. Without this, an input consisting of
    // only a declaration would parse "successfully" into nothing.
    expect(() => parseXml('<?xml version="1.0"?>')).toThrow(XmlParseError);
  });
});

describe('round trip', () => {
  // If the XML can be rebuilt from the tree and re-parsing gives the same
  // tree, nothing was lost structurally.
  it('parse -> serialize -> parse produces a deeply equal tree', () => {
    const first = parseXml(fixture);
    const second = parseXml(serializeXml(first));

    expect(second).toEqual(first);
  });

  it('survives a second round trip unchanged', () => {
    const first = parseXml(fixture);
    const second = parseXml(serializeXml(first));
    const third = parseXml(serializeXml(second));

    expect(third).toEqual(first);
  });

  it('round-trips node kinds the fixture does not contain', () => {
    const xml =
      '<r a="1"><![CDATA[raw <> & ]]><!--note--><?tgt data?><e/>text</r>';
    const first = parseXml(xml);

    expect(parseXml(serializeXml(first))).toEqual(first);
    expect(rootElement(first).children.map((c) => c.kind)).toEqual([
      'cdata',
      'comment',
      'pi',
      'element',
      'text',
    ]);
  });

  it('round-trips characters that need escaping', () => {
    const xml = '<r note="quote &quot; amp &amp; lt &lt;">a &lt; b &amp; c</r>';
    const first = parseXml(xml);

    expect(parseXml(serializeXml(first))).toEqual(first);
    expect(rootElement(first).attributes[0]?.value).toBe('quote " amp & lt <');
  });
});
