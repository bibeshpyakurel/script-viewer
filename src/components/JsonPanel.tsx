import { useState } from 'react';
import type { XmlNode } from '../types/xmlNode';

/**
 * The brief asks for "valid JSON a reviewer can inspect", so the parsed tree is
 * viewable and copyable in full — including the whitespace text nodes the tree
 * view filters out. What you copy is exactly what the parser produced.
 */
export function JsonPanel({ tree }: { tree: XmlNode }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const json = JSON.stringify(tree, null, 2);

  async function copy() {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can be blocked; the textarea below is always selectable.
      setCopied(false);
    }
  }

  return (
    <section className="json-panel">
      <div className="json-head">
        <button
          type="button"
          className="btn"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? 'Hide' : 'View'} parsed JSON
        </button>
        {open && (
          <>
            <button type="button" className="btn" onClick={copy}>
              {copied ? 'Copied' : 'Copy'}
            </button>
            <span className="json-size">
              {json.split('\n').length.toLocaleString()} lines
            </span>
          </>
        )}
      </div>
      {open && (
        <pre className="json-body" tabIndex={0}>
          {json}
        </pre>
      )}
    </section>
  );
}
