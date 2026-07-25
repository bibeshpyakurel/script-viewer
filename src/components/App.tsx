import { useMemo, useState } from 'react';
import { safeParseXml } from '../parser/parseXml';
import type { XmlNode } from '../types/xmlNode';
import { XmlNodeView } from './XmlNodeView';
import { JsonPanel } from './JsonPanel';
import fixture from '../fixtures/sample-script.xml?raw';
import './app.css';

/**
 * Deep enough that the landing view reaches the script's page list, which is
 * the thing a reviewer actually came to read. Shallower and they open to
 * export metadata and have to go hunting.
 */
const DEFAULT_OPEN_DEPTH = 5;

export function App() {
  // `safeParseXml`, not `parseXml`: a throw during render would blank the
  // screen. A returned result lets us show the message instead.
  const result = useMemo(() => safeParseXml(fixture), []);

  return (
    <div className="app">
      <header className="masthead">
        <h1>Script Viewer</h1>
        <p className="tagline">
          An AnSer call-center script export, parsed into a lossless tree.
        </p>
      </header>

      {result.ok ? (
        <ScriptView tree={result.tree} />
      ) : (
        <ParseErrorView message={result.error.message} />
      )}
    </div>
  );
}

function ScriptView({ tree }: { tree: XmlNode }) {
  const [openToDepth, setOpenToDepth] = useState(DEFAULT_OPEN_DEPTH);
  // Remounting resets every node's local open state to the new default.
  const [treeKey, setTreeKey] = useState(0);
  const stats = useMemo(() => summarize(tree), [tree]);

  function setAll(depth: number) {
    setOpenToDepth(depth);
    setTreeKey((k) => k + 1);
  }

  return (
    <>
      {/* Derived from structure alone — no tag name is inspected. */}
      <section className="stats" aria-label="Document summary">
        <Stat label="elements" value={stats.elements} />
        <Stat label="attributes" value={stats.attributes} />
        <Stat label="text nodes" value={stats.text} />
        <Stat label="max depth" value={stats.depth} />
      </section>

      <div className="toolbar">
        <button type="button" className="btn" onClick={() => setAll(Infinity)}>
          Expand all
        </button>
        <button type="button" className="btn" onClick={() => setAll(1)}>
          Collapse all
        </button>
        <span className="hint">
          Showing {DEFAULT_OPEN_DEPTH} levels by default
        </span>
      </div>

      <JsonPanel tree={tree} />

      <main className="tree" key={treeKey}>
        <XmlNodeView node={tree} depth={0} openToDepth={openToDepth} />
      </main>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="stat">
      <span className="stat-value">{value.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  );
}

/** Shown instead of a blank screen when the XML cannot be parsed. */
function ParseErrorView({ message }: { message: string }) {
  return (
    <section className="error" role="alert">
      <h2>This file could not be parsed</h2>
      <pre className="error-message">{message}</pre>
      <p className="error-help">
        The XML is not well-formed. Nothing was rendered because a partially
        parsed document would misrepresent the source.
      </p>
    </section>
  );
}

/** Counts derived generically from node shape — never from a tag name. */
function summarize(node: XmlNode): {
  elements: number;
  attributes: number;
  text: number;
  depth: number;
} {
  let elements = 0;
  let attributes = 0;
  let text = 0;
  let depth = 0;

  const walk = (n: XmlNode, d: number): void => {
    depth = Math.max(depth, d);
    if (n.kind === 'element') {
      elements += 1;
      attributes += n.attributes.length;
      n.children.forEach((c) => walk(c, d + 1));
    } else if (n.kind === 'text' && n.value.trim() !== '') {
      text += 1;
    }
  };

  walk(node, 1);
  return { elements, attributes, text, depth };
}
