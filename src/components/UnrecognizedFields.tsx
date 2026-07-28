import type { XmlElementNode } from '../types/xmlNode';
import { XmlNodeView } from './XmlNodeView';

/**
 * Script content the semantic view has no styled presentation for.
 *
 * This component is the reason the semantic view can be trusted. Every view in
 * `ScriptView` ends by handing its leftover children here, so the failure mode
 * of a domain-aware UI — a field nobody anticipated quietly not being drawn —
 * is designed out. An unfamiliar element loses its bespoke styling, never its
 * presence, and it arrives complete: attributes, nested structure, and text.
 *
 * The fallback renderer is the generic {@link XmlNodeView}, which is the same
 * component the Tree tab uses. So the semantic view degrades into the generic
 * one exactly where its knowledge runs out, rather than degrading into nothing.
 */
export function UnrecognizedFields({
  nodes,
  context,
}: {
  nodes: readonly XmlElementNode[];
  /** What these fields hang off, e.g. "this element". Used in the caption. */
  context?: string;
}) {
  if (nodes.length === 0) return null;

  return (
    <div className="unknown">
      <div className="unknown-head">
        <span className="unknown-badge">unrecognized</span>
        <span className="unknown-note">
          {nodes.length === 1 ? '1 field' : `${nodes.length} fields`} on{' '}
          {context ?? 'this element'} with no dedicated display. Shown in full,
          because the export defines what exists — not this viewer.
        </span>
      </div>
      <div className="unknown-body">
        {nodes.map((node, i) => (
          <XmlNodeView key={i} node={node} depth={0} openToDepth={Infinity} />
        ))}
      </div>
    </div>
  );
}
