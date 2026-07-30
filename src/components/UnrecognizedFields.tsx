import type { XmlAttribute, XmlElementNode } from '../types/xmlNode';
import { XmlNodeView } from './XmlNodeView';

/**
 * Script content the semantic view has no styled presentation for.
 *
 * This component is the reason the semantic view can be trusted. Every view in
 * `ScriptView` ends by handing its leftover children AND its leftover
 * attributes here, so the failure mode of a domain-aware UI — a field nobody
 * anticipated quietly not being drawn — is designed out on both axes. An
 * unfamiliar element loses its bespoke styling, never its presence, and it
 * arrives complete: attributes, nested structure, and text.
 *
 * The fallback renderer is the generic {@link XmlNodeView}, which is the same
 * component the Tree tab uses. So the semantic view degrades into the generic
 * one exactly where its knowledge runs out, rather than degrading into nothing.
 */
export function UnrecognizedFields({
  nodes,
  attributes = [],
  context,
}: {
  nodes: readonly XmlElementNode[];
  /** Attributes the caller did not name. Rendered as name/value pairs. */
  attributes?: readonly XmlAttribute[];
  /** What these fields hang off, e.g. "this element". Used in the caption. */
  context?: string;
}) {
  const count = nodes.length + attributes.length;
  if (count === 0) return null;

  return (
    <div className="unknown">
      <div className="unknown-head">
        <span className="unknown-badge">unrecognized</span>
        <span className="unknown-note">
          {count === 1 ? '1 field' : `${count} fields`} on{' '}
          {context ?? 'this element'} with no dedicated display. Shown in full,
          because the export defines what exists — not this viewer.
        </span>
      </div>
      <div className="unknown-body">
        {/* Attributes first: they belong to the element the caller already
            rendered, so they read as annotations on it rather than as new
            structure. Same markup as the tree view, for visual continuity. */}
        {attributes.length > 0 && (
          <span className="attrs">
            {attributes.map((attribute, i) => (
              <span className="attr" key={`${attribute.name}-${i}`}>
                <span className="attr-name">{attribute.name}</span>
                <span className="attr-eq" aria-hidden="true">
                  =
                </span>
                <span className="attr-value">{attribute.value}</span>
              </span>
            ))}
          </span>
        )}
        {nodes.map((node, i) => (
          <XmlNodeView key={i} node={node} depth={0} openToDepth={Infinity} />
        ))}
      </div>
    </div>
  );
}
