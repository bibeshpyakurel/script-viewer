import { useMemo, useState } from 'react';
import { safeParseXml } from '../parser/parseXml';
import { checkFidelity, collectVocabulary } from '../parser/analyze';
import type { XmlNode } from '../types/xmlNode';
import { XmlNodeView } from './XmlNodeView';
import { JsonPanel } from './JsonPanel';
import { VocabularyPanel } from './VocabularyPanel';
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
  const fidelity = useMemo(() => checkFidelity(tree), [tree]);
  const vocabulary = useMemo(() => collectVocabulary(tree), [tree]);

  function setAll(depth: number) {
    setOpenToDepth(depth);
    setTreeKey((k) => k + 1);
  }

  return (
    <>
      {/* Derived from structure alone — no tag name is inspected. */}
      <section className="stats" aria-label="Document summary">
        <Stat label="elements" value={fidelity.elements} />
        <Stat label="attributes" value={fidelity.attributes} />
        <Stat label="text nodes" value={fidelity.textNodes} />
        <Stat label="nodes dropped" value={fidelity.dropped} />
      </section>

      {/* The invisible 30%, made visible. Measured, not asserted. */}
      <p
        className={`fidelity${fidelity.roundTripOk ? ' fidelity-ok' : ' fidelity-bad'}`}
      >
        <span className="fidelity-mark" aria-hidden="true">
          {fidelity.roundTripOk ? '✓' : '✕'}
        </span>
        {fidelity.roundTripOk
          ? `Round trip verified — serializing this tree back to XML and parsing it again returns all ${fidelity.totalNodes.toLocaleString()} nodes, identical.`
          : 'Round trip FAILED — this tree does not survive re-serialization.'}
      </p>

      <VocabularyPanel vocabulary={vocabulary} />

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
