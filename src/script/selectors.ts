import type { XmlAttribute, XmlElementNode, XmlNode } from '../types/xmlNode';

/**
 * A read-only lookup layer over the generic {@link XmlNode} tree.
 *
 * ## What this module is, and what it deliberately is not
 *
 * This is the one place in the project that knows AnSer's vocabulary — that a
 * `<Page>` holds `<XmlElements>`, that `<Requirements>` describes an input. The
 * semantic view needs that knowledge to organize a script the way a reviewer
 * reads one.
 *
 * It is **not** a parse step, and it is **not** a typed parse result. The
 * distinction matters, because a typed parse result is exactly the allowlist the
 * brief forbids:
 *
 * - Nothing here runs during parsing. `parseXml` stays vocabulary-free, and the
 *   tree it produces is complete before any function in this file is called.
 * - Nothing here is the only path to the data. Every value these selectors
 *   surface is still in the tree, still in the JSON, still in the tree view.
 * - **Nothing here can drop a field, on either axis.** A name this module has
 *   never heard of is not skipped: child elements come back through
 *   {@link partition} as `rest`, attributes through {@link unknownAttributes},
 *   and the view renders both generically. Unrecognized is a rendering mode,
 *   not a filter.
 *
 * So the failure mode of a domain model — add `<FutureVendorSetting>` to the
 * export and watch it vanish at the type boundary — cannot happen here. The
 * worst case is that a new field renders as a generic node instead of a styled
 * one, which is a cosmetic gap, not data loss. There is a test for exactly that.
 *
 * Naming a field in a `*_KNOWN` list is therefore a PROMISE TO RENDER IT.
 * Listing a name moves it out of `rest`, so a name that is recognized but never
 * drawn disappears from the view entirely — which is how `<XmlVersion>` went
 * missing once. See DECISIONS.md §14.
 *
 * ## Reading conventions
 *
 * Selectors return `undefined` rather than throwing when something is absent. A
 * partial or unusual export should render what it has, not blank the screen.
 */

// ---------------------------------------------------------------------------
// Generic tree helpers — no AnSer vocabulary below this line.
// ---------------------------------------------------------------------------

/** True for the two node kinds that carry a `children` array. */
function hasChildren(node: XmlNode): boolean {
  return node.kind === 'element' || node.kind === 'document';
}

/** Child nodes, or `[]` for a leaf kind. Saves a repeated narrowing dance. */
function childrenOf(node: XmlNode): readonly XmlNode[] {
  return node.kind === 'element' || node.kind === 'document'
    ? node.children
    : [];
}

/** Direct child elements, in document order, skipping text and comments. */
export function childElements(node: XmlNode | undefined): XmlElementNode[] {
  if (!node) return [];
  return childrenOf(node).filter(
    (c): c is XmlElementNode => c.kind === 'element',
  );
}

/** The root element of a parsed document, or `undefined` if there is none. */
export function rootElement(node: XmlNode): XmlElementNode | undefined {
  if (node.kind === 'element') return node;
  return childElements(node)[0];
}

/** First direct child element with this name. */
export function child(
  node: XmlNode | undefined,
  name: string,
): XmlElementNode | undefined {
  if (!node) return undefined;
  return childElements(node).find((c) => c.name === name);
}

/** All direct child elements with this name, in document order. */
export function children(
  node: XmlNode | undefined,
  name: string,
): XmlElementNode[] {
  if (!node) return [];
  return childElements(node).filter((c) => c.name === name);
}

/** First element with this name anywhere beneath `node`, depth-first. */
export function descendant(
  node: XmlNode | undefined,
  name: string,
): XmlElementNode | undefined {
  if (!node) return undefined;
  if (node.kind === 'element' && node.name === name) return node;
  if (!hasChildren(node)) return undefined;
  for (const c of childrenOf(node)) {
    const hit = descendant(c, name);
    if (hit) return hit;
  }
  return undefined;
}

/** An attribute's value, or `undefined` if the element does not carry it. */
export function attr(
  node: XmlElementNode | undefined,
  name: string,
): string | undefined {
  return node?.attributes.find((a) => a.name === name)?.value;
}

/**
 * An element's own text content, trimmed.
 *
 * Concatenates direct text and CDATA children only — it does not descend, so a
 * container like `<Requirements>` reads as empty rather than as a run-on of
 * everything nested inside it.
 */
export function text(node: XmlElementNode | undefined): string {
  if (!node) return '';
  return node.children
    .filter((c) => c.kind === 'text' || c.kind === 'cdata')
    .map((c) => (c.kind === 'text' || c.kind === 'cdata' ? c.value : ''))
    .join('')
    .trim();
}

/** Text of the first child element with this name. `undefined` when absent. */
export function childText(
  node: XmlNode | undefined,
  name: string,
): string | undefined {
  const found = child(node, name);
  return found ? text(found) : undefined;
}

/** A name/value pair read off the tree, for generic key-value rendering. */
export interface Field {
  name: string;
  value: string;
  /** The element it came from, so a view can drill in or show attributes. */
  node: XmlElementNode;
}

/**
 * Every child element that is a simple `<Name>value</Name>` leaf, as pairs.
 *
 * This is what keeps blocks like `<Requirements>` and `<XmlDisplayNode>` free of
 * an allowlist. Rather than reading four known fields, a view asks for whatever
 * leaves are present — so `<SaveFormatted>`, which appears on exactly one
 * element in the fixture, needs no special case, and a requirement type invented
 * next year renders the same way.
 *
 * Elements with element children are excluded: they are structure, not a value,
 * and a caller that wants them should recurse deliberately.
 */
export function simpleFields(node: XmlNode | undefined): Field[] {
  if (!node) return [];
  return childElements(node)
    .filter((c) => childElements(c).length === 0)
    .map((c) => ({ name: c.name, value: text(c), node: c }));
}

/** The result of splitting an element's children into named and leftover. */
export interface Partition {
  /** Child elements whose names the caller listed. */
  recognized: XmlElementNode[];
  /**
   * Everything else, in document order. The view MUST render these — this is
   * the mechanism that stops an unfamiliar field from being silently skipped.
   */
  rest: XmlElementNode[];
}

/**
 * Split child elements into the ones a view names explicitly and the rest.
 *
 * Every semantic view in this project ends by rendering `rest` generically. That
 * inverts the usual failure mode: instead of a view showing only what it was
 * taught about, it shows everything, and only the *styling* depends on
 * recognition. An element added to a future export appears immediately, flagged
 * as unrecognized, with no code change here or in the parser.
 */
export function partition(
  node: XmlNode | undefined,
  known: readonly string[],
): Partition {
  const all = node ? childElements(node) : [];
  const knownSet = new Set(known);
  return {
    recognized: all.filter((c) => knownSet.has(c.name)),
    rest: all.filter((c) => !knownSet.has(c.name)),
  };
}

/**
 * The attributes a view does not name — the other half of {@link partition}.
 *
 * `partition` splits child elements, which leaves a gap: an attribute nobody
 * anticipated would reach the JSON and the tree view but never appear in the
 * semantic view, and nothing would flag it. That is the same silent-drop
 * failure `rest` exists to prevent, one axis over.
 *
 * Namespace declarations are excluded deliberately. They are document plumbing
 * rather than script content, the tree view already shows them verbatim, and
 * badging `xmlns:xsi` as an unrecognized script field would be noise.
 */
export function unknownAttributes(
  node: XmlElementNode | undefined,
  known: readonly string[],
): XmlAttribute[] {
  if (!node) return [];
  const knownSet = new Set(known);
  return node.attributes.filter(
    (a) => !knownSet.has(a.name) && !a.name.startsWith('xmlns'),
  );
}

// ---------------------------------------------------------------------------
// AnSer vocabulary begins here. Everything above is name-agnostic.
// ---------------------------------------------------------------------------

/** Where in the document a selector found something, for "jump to tree" links. */
export interface ScriptExportModel {
  /** The `<ScriptExport>` root, or undefined for a document shaped otherwise. */
  root: XmlElementNode | undefined;
  source: XmlElementNode | undefined;
  developers: XmlElementNode[];
  client: XmlElementNode | undefined;
  script: XmlElementNode | undefined;
  versions: XmlElementNode[];
  /** Top-level children of `<ScriptExport>` this model does not name. */
  rest: XmlElementNode[];
}

const EXPORT_KNOWN = ['Source', 'Developers', 'Client', 'Script'] as const;

/** Locate the top-level parts of an export. */
export function getScriptExport(doc: XmlNode): ScriptExportModel {
  const root = rootElement(doc);
  const script = child(root, 'Script');
  return {
    root,
    source: child(root, 'Source'),
    developers: children(child(root, 'Developers'), 'Developer'),
    client: child(root, 'Client'),
    script,
    versions: children(child(script, 'Versions'), 'Version'),
    rest: partition(root, EXPORT_KNOWN).rest,
  };
}

/** Pages of a version, in the order the export lists them. */
export function getPages(
  version: XmlElementNode | undefined,
): XmlElementNode[] {
  return children(child(version, 'Pages'), 'Page');
}

/** The `<anyType>` (or otherwise named) elements on a page, in order. */
export function getPageElements(page: XmlElementNode): XmlElementNode[] {
  return childElements(child(page, 'XmlElements'));
}

/** One option in a `<Select>`-style element. */
export interface ScriptOption {
  /** The `value` attribute — what gets stored. */
  value: string | undefined;
  /** The element text — what the operator reads. */
  label: string;
}

/** One `<Mode>`, with any hint text it carries. */
export interface ScriptMode {
  name: string | undefined;
  /** Simple leaves under the mode's serialization data, e.g. `InputHint`. */
  fields: Field[];
  node: XmlElementNode;
}

/** A resolved view of one script element, for the semantic renderer. */
export interface ScriptElementModel {
  node: XmlElementNode;
  id: string | undefined;
  name: string | undefined;
  description: string | undefined;
  /** `<NodeType>` — `Display` or `Input` in the fixture. */
  nodeType: string | undefined;
  /** The `xsi:type` attribute — the more specific kind. */
  xsiType: string | undefined;
  tag: string | undefined;
  /** `<OperatorPrompt>` leaves: Instruction, SpokenText, AfterHoursText. */
  prompt: Field[];
  /** `<Requirements>` leaves, read generically. */
  requirements: Field[];
  /** `<XmlDisplayNode>` leaves, read generically. */
  display: Field[];
  /** `<XmlCalcNode>` expressions, with their attributes intact. */
  calcs: XmlElementNode[];
  options: ScriptOption[];
  modes: ScriptMode[];
  /** `<ConditionalActions>` `<When>` blocks, rendered from attributes. */
  conditions: XmlElementNode[];
  /** `elementId` values from `<TemplateFields>`, in order. */
  templateFieldIds: string[];
  navType: string | undefined;
  navScreen: string | undefined;
  /** Children this model does not name — rendered generically, never dropped. */
  rest: XmlElementNode[];
  /** Attributes this model does not name. Same contract as {@link rest}. */
  restAttributes: XmlAttribute[];
}

/**
 * The attributes {@link getScriptElement} reads explicitly.
 *
 * Only `xsi:type` today. As with {@link ELEMENT_KNOWN}, this list computes what
 * is left over — it never filters anything out of the view.
 */
const ELEMENT_KNOWN_ATTRS = ['xsi:type'] as const;

/**
 * The child names {@link getScriptElement} reads explicitly.
 *
 * This list exists to compute `rest`, NOT to filter. Anything absent from it
 * still reaches the view; it just renders generically. Adding a name here is a
 * presentation upgrade, never a correctness fix.
 */
const ELEMENT_KNOWN = [
  'Id',
  'NodeType',
  'Name',
  'Description',
  'Tag',
  'OperatorPrompt',
  'Requirements',
  'XmlCalcNode',
  'XmlDisplayNode',
  'Modes',
  'Options',
  'ConditionalActions',
  'TemplateFields',
  'NavType',
  'NavScreen',
] as const;

/** Resolve one script element into the shape the semantic view renders. */
export function getScriptElement(node: XmlElementNode): ScriptElementModel {
  return {
    node,
    id: childText(node, 'Id'),
    name: childText(node, 'Name'),
    description: childText(node, 'Description'),
    nodeType: childText(node, 'NodeType'),
    xsiType: attr(node, 'xsi:type'),
    tag: childText(node, 'Tag'),
    prompt: simpleFields(child(node, 'OperatorPrompt')),
    requirements: simpleFields(child(node, 'Requirements')),
    display: simpleFields(child(node, 'XmlDisplayNode')),
    // Kept as elements, not pairs: `<Expr dataType="Boolean" source="training">`
    // carries meaning in its attributes that a name/value pair would lose.
    calcs: children(node, 'XmlCalcNode').flatMap(childElements),
    options: children(child(node, 'Options'), 'Option').map((o) => ({
      value: attr(o, 'value'),
      label: text(o),
    })),
    modes: children(child(node, 'Modes'), 'Mode').map((m) => ({
      name: attr(m, 'ModeName'),
      fields: simpleFields(child(m, 'XmlSerializiationData')),
      node: m,
    })),
    conditions: children(child(node, 'ConditionalActions'), 'When'),
    templateFieldIds: children(child(node, 'TemplateFields'), 'FieldRef')
      .map((f) => attr(f, 'elementId'))
      .filter((id): id is string => id !== undefined),
    navType: childText(node, 'NavType'),
    navScreen: childText(node, 'NavScreen'),
    rest: partition(node, ELEMENT_KNOWN).rest,
    restAttributes: unknownAttributes(node, ELEMENT_KNOWN_ATTRS),
  };
}

/** Child names {@link getPageModel} reads explicitly; see {@link ELEMENT_KNOWN}. */
const PAGE_KNOWN = [
  'Name',
  'XmlVersion',
  'XmlElements',
  'Styles',
  'SummaryHeader',
  'CompletionAction',
] as const;

/** The attributes {@link getPageModel} reads explicitly. */
const PAGE_KNOWN_ATTRS = ['pageId', 'order'] as const;

/** A page and everything hanging off it. */
export interface PageModel {
  node: XmlElementNode;
  pageId: string | undefined;
  order: string | undefined;
  name: string | undefined;
  /** `<XmlVersion>` — the page's own schema revision, distinct from the export's. */
  xmlVersion: string | undefined;
  summaryHeader: string | undefined;
  elements: ScriptElementModel[];
  /** `<Style>` blocks defined on this page. */
  styles: XmlElementNode[];
  completionAction: XmlElementNode | undefined;
  rest: XmlElementNode[];
  /** Attributes this model does not name. Same contract as {@link rest}. */
  restAttributes: XmlAttribute[];
}

/** Resolve one `<Page>` into the shape the semantic view renders. */
export function getPageModel(page: XmlElementNode): PageModel {
  return {
    node: page,
    pageId: attr(page, 'pageId'),
    order: attr(page, 'order'),
    name: childText(page, 'Name'),
    xmlVersion: childText(page, 'XmlVersion'),
    summaryHeader: childText(page, 'SummaryHeader'),
    elements: getPageElements(page).map(getScriptElement),
    styles: children(child(page, 'Styles'), 'Style'),
    completionAction: child(page, 'CompletionAction'),
    rest: partition(page, PAGE_KNOWN).rest,
    restAttributes: unknownAttributes(page, PAGE_KNOWN_ATTRS),
  };
}

/**
 * Every element on every page, indexed by its `<Id>`.
 *
 * Used to turn a `<FieldRef elementId="...">` or a `<NavScreen>` target into
 * something a reviewer can read, instead of an opaque identifier.
 */
export function indexElementsById(
  pages: readonly PageModel[],
): Map<string, ScriptElementModel> {
  const index = new Map<string, ScriptElementModel>();
  for (const page of pages) {
    for (const el of page.elements) {
      if (el.id !== undefined && !index.has(el.id)) index.set(el.id, el);
    }
  }
  return index;
}

/** Page names indexed by `pageId`, for resolving navigation targets. */
export function indexPagesById(
  pages: readonly PageModel[],
): Map<string, PageModel> {
  const index = new Map<string, PageModel>();
  for (const page of pages) {
    if (page.pageId !== undefined) index.set(page.pageId, page);
  }
  return index;
}

/** Developer display names indexed by `developerId`, for authorship lines. */
export function indexDevelopersById(
  developers: readonly XmlElementNode[],
): Map<string, string> {
  const index = new Map<string, string>();
  for (const dev of developers) {
    const id = attr(dev, 'developerId');
    if (id !== undefined) index.set(id, childText(dev, 'DisplayName') ?? id);
  }
  return index;
}
