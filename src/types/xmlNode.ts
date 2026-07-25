/**
 * A single, uniform representation for every node in an XML document.
 *
 * One shape serves every tag. There is no `PageNode` or `ModeNode` — a `<Page>`
 * and a `<Mode>` are both `XmlNode` with a different `name`. Structure is data,
 * not type-level knowledge, so the same traversal code works on any document
 * without knowing its vocabulary in advance. That is what lets an element the
 * parser has never seen, like the fixture's `<FutureVendorSetting>`, survive
 * without a single line changing.
 *
 * ## Why `children` is an ORDERED array
 *
 * In XML, sibling order IS meaning. The fixture's three `<Option>` elements —
 * `Routine`, `Urgent`, `Emergency` — are a dropdown whose order an operator
 * reads top to bottom; reversing them changes what the script does. The same
 * holds for the three `<Page>` elements that make up the call flow.
 *
 * Repeated tags are also normal: a `<Modes>` holds many `<Mode>` elements, and
 * an `<XmlElements>` holds many `<anyType>` elements. Grouping children into an
 * object keyed by tag name (`{ Option: [...], Mode: [...] }`) would collapse
 * that interleaving and make document order unrecoverable. An array preserves
 * order exactly as written, and mixed content — text sitting between elements —
 * keeps its position relative to those elements.
 *
 * ## Why `attributes` is an ORDERED array, not an object
 *
 * An object keyed by attribute name loses three things this type must keep:
 *
 * 1. **Order** — key order is not a guarantee worth relying on, and round-
 *    tripping a document should not silently reshuffle attributes.
 * 2. **Duplicates** — an object collapses repeated names to the last value. A
 *    parser that must *report* malformed input cannot flag what it has already
 *    silently discarded.
 * 3. **Namespaces** — declarations (`xmlns:xsi`, `xmlns:xsd`) and prefixed
 *    names (`xsi:type`) are ordinary attributes here, held verbatim, prefix
 *    included. The fixture makes the case concrete: it declares `xmlns:xsd` on
 *    the root and then never uses it. A parser that recorded only the
 *    namespaces it saw *in use* would drop that declaration entirely. Keeping
 *    raw name/value pairs also defers deciding what a prefix resolves to, so
 *    nothing is guessed at parse time.
 *
 * Both arrays are therefore the lossless choice: the node remembers not just
 * what the document said, but the order in which it said it.
 */
export type XmlNode =
  | XmlElementNode
  | XmlTextNode
  | XmlCDataNode
  | XmlCommentNode
  | XmlProcessingInstructionNode;

/** A single attribute, name kept exactly as written (prefix included). */
export interface XmlAttribute {
  /** Verbatim source name: `order`, `xmlns:xsi`, `xsi:type`. Never normalized. */
  name: string;
  value: string;
}

/**
 * An element: `<Page pageId="training-page-caller-information" order="1">`.
 *
 * An empty element is still a full node — the fixture's `<XmlCalcNode />`
 * parses to an `XmlElementNode` with `children: []`, never to `null`,
 * `undefined`, or an omitted field. Absent children and zero children are the
 * same thing in XML, and callers should be able to iterate without a presence
 * check.
 */
export interface XmlElementNode {
  kind: 'element';
  /** Tag name exactly as written, namespace prefix included: `xsd:schema`. */
  name: string;
  /** Ordered; empty array when the element has no attributes. */
  attributes: XmlAttribute[];
  /** Ordered; empty array for an empty element. Never omitted. */
  children: XmlNode[];
}

/** Character data between tags. `value` is the raw text as it appeared. */
export interface XmlTextNode {
  kind: 'text';
  value: string;
}

/** `<![CDATA[…]]>`. Kept distinct from text so it can be re-emitted as CDATA. */
export interface XmlCDataNode {
  kind: 'cdata';
  /** Raw inner content, without the `<![CDATA[` / `]]>` delimiters. */
  value: string;
}

/** `<!-- … -->`. Retained rather than dropped so a round trip stays lossless. */
export interface XmlCommentNode {
  kind: 'comment';
  /** Raw inner content, without the `<!--` / `-->` delimiters. */
  value: string;
}

/**
 * A processing instruction: `<?xml-stylesheet href="s.xsl"?>`.
 *
 * This kind also carries the XML declaration that opens the fixture,
 * `<?xml version="1.0" encoding="utf-8"?>`, as `target: 'xml'` with
 * `data: 'version="1.0" encoding="utf-8"'`.
 *
 * Strictly, the XML spec treats the declaration as its own production and
 * forbids `xml` as a PI target, so this reuse is a deliberate simplification:
 * it keeps the union at five kinds instead of six, and the declaration is
 * syntactically identical to a PI. The alternative — dropping it — would mean
 * the very first line of the supplied document vanished from the parsed
 * result, which is exactly the kind of silent loss this type exists to prevent.
 */
export interface XmlProcessingInstructionNode {
  kind: 'pi';
  /** The name after `<?`: `xml`, `xml-stylesheet`. */
  target: string;
  /** Everything after the target, before `?>`, verbatim and unparsed. */
  data: string;
}
