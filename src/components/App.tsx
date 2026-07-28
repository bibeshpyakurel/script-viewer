import { useMemo, useState } from 'react';
import { safeParseXml } from '../parser/parseXml';
import { checkFidelity, collectVocabulary } from '../parser/analyze';
import type { XmlNode } from '../types/xmlNode';
import { XmlNodeView } from './XmlNodeView';
import { JsonPanel } from './JsonPanel';
import { VocabularyPanel } from './VocabularyPanel';
import { ScriptView } from './ScriptView';
import { SourcePicker } from './SourcePicker';
import fixture from '../fixtures/sample-script.xml?raw';
import './app.css';

/**
 * Deep enough that the landing view reaches the script's page list, which is
 * the thing a reviewer actually came to read. Shallower and they open to
 * export metadata and have to go hunting.
 */
const DEFAULT_OPEN_DEPTH = 6;

type Tab = 'script' | 'tree' | 'json';

/** Which XML the app is showing: the bundled fixture, or a file the user opened. */
interface Source {
  label: string;
  xml: string;
}

const FIXTURE_SOURCE: Source = { label: 'sample-script.xml', xml: fixture };

export function App() {
  const [source, setSource] = useState<Source>(FIXTURE_SOURCE);
  const [tab, setTab] = useState<Tab>('script');

  // `safeParseXml`, not `parseXml`: a throw during render would blank the
  // screen. A returned result lets us show the message instead.
  const result = useMemo(() => safeParseXml(source.xml), [source]);

  return (
    <div className="app">
      <header className="masthead">
        <div className="masthead-row">
          <div>
            <h1>Script Viewer</h1>
            <p className="tagline">
              An AnSer call-center script export, parsed into a lossless tree.
            </p>
          </div>
          <SourcePicker
            current={source.label}
            isFixture={source.xml === fixture}
            onLoad={(label, xml) => setSource({ label, xml })}
            onReset={() => setSource(FIXTURE_SOURCE)}
          />
        </div>
      </header>

      {result.ok ? (
        <LoadedView
          tree={result.tree}
          tab={tab}
          onTab={setTab}
          sourceLabel={source.label}
        />
      ) : (
        <ParseErrorView
          message={result.error.message}
          sourceLabel={source.label}
        />
      )}
    </div>
  );
}

function LoadedView({
  tree,
  tab,
  onTab,
  sourceLabel,
}: {
  tree: XmlNode;
  tab: Tab;
  onTab: (tab: Tab) => void;
  sourceLabel: string;
}) {
  const fidelity = useMemo(() => checkFidelity(tree), [tree]);
  const vocabulary = useMemo(() => collectVocabulary(tree), [tree]);

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

      <nav className="tabs" aria-label="View">
        <TabButton id="script" tab={tab} onTab={onTab}>
          Script
        </TabButton>
        <TabButton id="tree" tab={tab} onTab={onTab}>
          Tree
        </TabButton>
        <TabButton id="json" tab={tab} onTab={onTab}>
          JSON
        </TabButton>
        <span className="tabs-hint">
          {tab === 'script' && 'The script, organized as a reviewer reads it'}
          {tab === 'tree' && 'Every node exactly as the parser produced it'}
          {tab === 'json' && `The parsed JSON for ${sourceLabel}`}
        </span>
      </nav>

      <main>
        {tab === 'script' && <ScriptView tree={tree} />}
        {tab === 'tree' && <TreeTab tree={tree} />}
        {tab === 'json' && <JsonPanel tree={tree} />}
      </main>
    </>
  );
}

function TabButton({
  id,
  tab,
  onTab,
  children,
}: {
  id: Tab;
  tab: Tab;
  onTab: (tab: Tab) => void;
  children: React.ReactNode;
}) {
  const selected = tab === id;
  return (
    <button
      type="button"
      className={`tab${selected ? ' tab-on' : ''}`}
      aria-current={selected ? 'page' : undefined}
      onClick={() => onTab(id)}
    >
      {children}
    </button>
  );
}

/** The generic tree, with its expand/collapse controls. */
function TreeTab({ tree }: { tree: XmlNode }) {
  const [openToDepth, setOpenToDepth] = useState(DEFAULT_OPEN_DEPTH);
  // Remounting resets every node's local open state to the new default.
  const [treeKey, setTreeKey] = useState(0);

  function setAll(depth: number) {
    setOpenToDepth(depth);
    setTreeKey((k) => k + 1);
  }

  return (
    <>
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

      <div className="tree" key={treeKey}>
        <XmlNodeView node={tree} depth={0} openToDepth={openToDepth} />
      </div>
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
function ParseErrorView({
  message,
  sourceLabel,
}: {
  message: string;
  sourceLabel: string;
}) {
  return (
    <section className="error" role="alert">
      <h2>{sourceLabel} could not be parsed</h2>
      <pre className="error-message">{message}</pre>
      <p className="error-help">
        The XML is not well-formed. Nothing was rendered because a partially
        parsed document would misrepresent the source. Load a different file, or
        go back to the bundled sample.
      </p>
    </section>
  );
}
