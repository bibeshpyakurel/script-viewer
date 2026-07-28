import { useState } from 'react';
import type {
  XmlDocumentNode,
  XmlElementNode,
  XmlNode,
} from '../types/xmlNode';

/**
 * The display-side mirror of the parser: a renderer that knows no tag names.
 *
 * Every branch below switches on `kind` — the same closed, structural set the
 * parser uses. Nothing compares a name against a list, so an element this code
 * has never seen renders correctly with no change. Refinements (inline text,
 * collapsibility) key off a node's SHAPE, never its identity.
 */
export function XmlNodeView({
  node,
  depth,
  openToDepth,
}: {
  node: XmlNode;
  depth: number;
  openToDepth: number;
}) {
  switch (node.kind) {
    // The document adds no row of its own; its children (the declaration, then
    // the root element) render at this level, which is where they belong.
    case 'document':
      return (
        <>
          {renderableChildren(node).map((child, i) => (
            <XmlNodeView
              key={i}
              node={child}
              depth={depth}
              openToDepth={openToDepth}
            />
          ))}
        </>
      );
    case 'element':
      return (
        <ElementView node={node} depth={depth} openToDepth={openToDepth} />
      );
    case 'text':
      return <LeafView kind="text" label="text" value={node.value} />;
    case 'cdata':
      return <LeafView kind="cdata" label="CDATA" value={node.value} />;
    case 'comment':
      return <LeafView kind="comment" label="comment" value={node.value} />;
    case 'pi':
      return (
        <LeafView
          kind="pi"
          label="processing instruction"
          value={`${node.target} ${node.data}`}
        />
      );
  }
}

/**
 * One element row, plus its children when expanded.
 *
 * Open state is local to each row and seeded from `openToDepth`, so the
 * expand/collapse buttons work by remounting the tree with a new default
 * rather than by threading a controlled value through every level.
 */
function ElementView({
  node,
  depth,
  openToDepth,
}: {
  node: XmlElementNode;
  depth: number;
  openToDepth: number;
}) {
  const children = renderableChildren(node);
  const inlineText = soleTextValue(children);
  // Expandable only when there is nested structure worth opening.
  const expandable = children.length > 0 && inlineText === null;
  const [open, setOpen] = useState(depth < openToDepth);

  return (
    <div className="node" data-depth={depth}>
      <div className="node-head">
        {expandable ? (
          <button
            type="button"
            className="twisty"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <span aria-hidden="true">{open ? '▾' : '▸'}</span>
            <span className="sr-only">
              {open ? 'Collapse' : 'Expand'} {node.name}
            </span>
          </button>
        ) : (
          <span className="twisty twisty-spacer" aria-hidden="true" />
        )}

        <span className="tag">
          <QualifiedName name={node.name} />
        </span>

        {node.attributes.length > 0 && (
          <span className="attrs">
            {node.attributes.map((attr, i) => (
              <span className="attr" key={`${attr.name}-${i}`}>
                <span className="attr-name">
                  <QualifiedName name={attr.name} />
                </span>
                <span className="attr-eq" aria-hidden="true">
                  =
                </span>
                <span className="attr-value">{attr.value}</span>
              </span>
            ))}
          </span>
        )}

        {/* A single text child reads better inline than as a nested row. */}
        {inlineText !== null && (
          <span className="inline-text">{inlineText}</span>
        )}

        {/* An empty element is REAL. Say so, so nothing looks dropped. */}
        {children.length === 0 && <span className="empty-badge">empty</span>}

        {expandable && !open && (
          <span className="count">
            {children.length} {children.length === 1 ? 'child' : 'children'}
          </span>
        )}
      </div>

      {expandable && open && (
        <div className="children">
          {children.map((child, i) => (
            <XmlNodeView
              key={i}
              node={child}
              depth={depth + 1}
              openToDepth={openToDepth}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Text, CDATA, comment, PI — all carry a raw value and no structure. */
function LeafView({
  kind,
  label,
  value,
}: {
  kind: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`node leaf leaf-${kind}`}>
      <span className="twisty twisty-spacer" aria-hidden="true" />
      <span className="leaf-label">{label}</span>
      <span className="leaf-value">{value}</span>
    </div>
  );
}

/**
 * Renders `xsi:type` with the prefix muted: present, but not shouting.
 * Generic — it splits on the first colon, whatever the prefix happens to be.
 */
function QualifiedName({ name }: { name: string }) {
  const colon = name.indexOf(':');
  if (colon === -1) return <>{name}</>;
  return (
    <>
      <span className="ns-prefix">{name.slice(0, colon + 1)}</span>
      {name.slice(colon + 1)}
    </>
  );
}

/**
 * Drop whitespace-only text. The parser keeps it deliberately (it is real
 * character data and dropping it there would be irreversible); the view is the
 * right place to filter it. The raw JSON panel still shows everything.
 */
export function renderableChildren(
  node: XmlElementNode | XmlDocumentNode,
): XmlNode[] {
  return node.children.filter(
    (c) => !(c.kind === 'text' && c.value.trim() === ''),
  );
}

/** The element's content when it is exactly one text node, else null. */
function soleTextValue(children: readonly XmlNode[]): string | null {
  const only = children.length === 1 ? children[0] : undefined;
  return only?.kind === 'text' ? only.value.trim() : null;
}
