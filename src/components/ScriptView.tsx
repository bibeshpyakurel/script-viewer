import { useMemo } from 'react';
import {
  attr,
  childText,
  getPageModel,
  getPages,
  getScriptExport,
  indexDevelopersById,
  indexElementsById,
  indexPagesById,
  simpleFields,
} from '../script/selectors';
import type {
  PageModel,
  ScriptElementModel,
  ScriptExportModel,
} from '../script/selectors';
import type { XmlElementNode, XmlNode } from '../types/xmlNode';
import { ScriptElementCard } from './ScriptElementCard';
import { UnrecognizedFields } from './UnrecognizedFields';

/**
 * The script, organized the way a reviewer reads one.
 *
 * The Tree tab answers "what is in this file?". This answers "what does this
 * script do?" — who it belongs to, which version is live, and then the call
 * itself, page by page in export order, from greeting to close.
 *
 * It reads the SAME parsed tree the other tabs render, through the selectors in
 * `script/selectors.ts`. There is no second parse, no duplicated display data,
 * and no copy of the fixture in code: change the XML and every value here moves
 * with it. Anything the selectors do not name still reaches the screen through
 * {@link UnrecognizedFields}.
 */
export function ScriptView({ tree }: { tree: XmlNode }) {
  const model = useMemo(() => getScriptExport(tree), [tree]);

  // The export's active version if it names one, else the first. A script with
  // no versions still renders its client and export metadata.
  const version = useMemo(() => {
    const activeId = childText(model.script, 'ActiveVersionId');
    return (
      model.versions.find((v) => attr(v, 'versionId') === activeId) ??
      model.versions[0]
    );
  }, [model]);

  const pages = useMemo(() => getPages(version).map(getPageModel), [version]);
  const elementsById = useMemo(() => indexElementsById(pages), [pages]);
  const pagesById = useMemo(() => indexPagesById(pages), [pages]);
  const developersById = useMemo(
    () => indexDevelopersById(model.developers),
    [model],
  );

  const author = childText(model.script, 'CreatedByDeveloperId');
  const totalElements = pages.reduce((n, p) => n + p.elements.length, 0);

  if (!model.root) {
    return (
      <p className="empty-note">
        This document has no root element, so there is no script to show.
      </p>
    );
  }

  return (
    <div className="script">
      <header className="script-head">
        <div className="script-title">
          <h2>{childText(model.script, 'Name') ?? 'Untitled script'}</h2>
          <p className="script-sub">
            {childText(model.client, 'Name') ?? 'Unknown client'}
            {childText(model.client, 'Status') && (
              <span className="dot-sep">
                {childText(model.client, 'Status')}
              </span>
            )}
          </p>
        </div>

        <dl className="facts">
          <Fact label="Version">
            {attr(version, 'versionNumber') ?? '—'}
            {childText(version, 'Status') && (
              <span className="fact-tag">{childText(version, 'Status')}</span>
            )}
          </Fact>
          <Fact label="Pages">{pages.length}</Fact>
          <Fact label="Elements">{totalElements}</Fact>
          <Fact label="Author">
            {(author && developersById.get(author)) ?? author ?? '—'}
          </Fact>
          <Fact label="Environment">
            {attr(model.root, 'environment') ?? '—'}
          </Fact>
        </dl>
      </header>

      {childText(version, 'ChangeReason') && (
        <p className="change-reason">
          <span className="change-label">Change reason</span>
          {childText(version, 'ChangeReason')}
        </p>
      )}

      {/* The call flow at a glance, before the detail. */}
      {pages.length > 0 && (
        <nav className="flow" aria-label="Call flow">
          {pages.map((page, i) => (
            <span className="flow-step" key={page.pageId ?? i}>
              <a className="flow-link" href={`#${page.pageId ?? ''}`}>
                <span className="flow-order">{page.order ?? i + 1}</span>
                <span className="flow-name">{page.name ?? 'Untitled'}</span>
                <span className="flow-count">
                  {page.elements.length}{' '}
                  {page.elements.length === 1 ? 'element' : 'elements'}
                </span>
              </a>
              {i < pages.length - 1 && (
                <span className="flow-arrow" aria-hidden="true">
                  →
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      {pages.map((page, i) => (
        <PageSection
          key={page.pageId ?? i}
          page={page}
          elementsById={elementsById}
          pagesById={pagesById}
        />
      ))}

      <ScriptMetadata
        model={model}
        version={version}
        developersById={developersById}
      />
    </div>
  );
}

/**
 * One page of the call, in the order an operator works through it: the
 * elements first, then the styles it defines, then how the page completes.
 *
 * The `id` on the section is what makes the call-flow links and the navigation
 * targets on each element scroll to the right place.
 */
function PageSection({
  page,
  elementsById,
  pagesById,
}: {
  page: PageModel;
  elementsById: Map<string, ScriptElementModel>;
  pagesById: Map<string, PageModel>;
}) {
  return (
    <section className="page" id={page.pageId}>
      <header className="page-head">
        <span className="page-order">{page.order ?? '?'}</span>
        <div>
          <h3 className="page-name">{page.name ?? 'Untitled page'}</h3>
          <p className="page-meta">
            {page.pageId && <code className="page-id">{page.pageId}</code>}
            {page.summaryHeader && (
              <span className="page-summary">
                Summary: {page.summaryHeader}
              </span>
            )}
          </p>
        </div>
      </header>

      {page.elements.length === 0 ? (
        <p className="empty-note">This page defines no elements.</p>
      ) : (
        page.elements.map((element, i) => (
          <ScriptElementCard
            key={element.id ?? i}
            element={element}
            elementsById={elementsById}
            pagesById={pagesById}
          />
        ))
      )}

      {page.styles.length > 0 && (
        <div className="styles">
          <h5 className="el-block-title">Styles defined on this page</h5>
          {page.styles.map((style, i) => (
            <div className="style" key={i}>
              <span className="style-name">
                {childText(style, 'Name') ?? 'Unnamed'}
              </span>
              {/* Read generically: a new style property needs no code change. */}
              {simpleFields(style)
                .filter((f) => f.name !== 'Name')
                .map((f) => (
                  <span className="style-prop" key={f.name}>
                    {f.name}: <b>{f.value}</b>
                  </span>
                ))}
            </div>
          ))}
        </div>
      )}

      {page.completionAction && (
        <div className="completion">
          <span className="completion-check" aria-hidden="true">
            ✓
          </span>
          <span className="completion-label">
            {childText(page.completionAction, 'Label') ?? 'Complete'}
          </span>
          {childText(page.completionAction, 'Outcome') && (
            <span className="completion-outcome">
              {childText(page.completionAction, 'Outcome')}
            </span>
          )}
        </div>
      )}

      <UnrecognizedFields nodes={page.rest} context="this page" />
    </section>
  );
}

/** Export provenance, kept at the bottom: useful, but not what you came for. */
function ScriptMetadata({
  model,
  version,
  developersById,
}: {
  model: ScriptExportModel;
  version: XmlElementNode | undefined;
  developersById: Map<string, string>;
}) {
  const rows: { label: string; value: string }[] = [];

  for (const a of model.root?.attributes ?? []) {
    // Namespace declarations are shown in the Tree tab; this is a summary.
    if (!a.name.startsWith('xmlns'))
      rows.push({ label: a.name, value: a.value });
  }
  for (const f of simpleFields(model.source)) {
    rows.push({ label: f.name, value: f.value });
  }
  if (model.client) {
    rows.push({
      label: 'clientId',
      value: attr(model.client, 'clientId') ?? '—',
    });
  }
  for (const f of simpleFields(model.script)) {
    rows.push({ label: f.name, value: f.value });
  }
  for (const f of simpleFields(version)) {
    rows.push({ label: f.name, value: f.value });
  }

  return (
    <section className="meta">
      <h3 className="meta-title">Export details</h3>

      <dl className="meta-grid">
        {rows.map((r, i) => (
          <div className="meta-row" key={`${r.label}-${i}`}>
            <dt>{r.label}</dt>
            <dd>{developersById.get(r.value) ?? r.value}</dd>
          </div>
        ))}
      </dl>

      {model.developers.length > 0 && (
        <div className="devs">
          <h5 className="el-block-title">Developers</h5>
          {model.developers.map((dev, i) => (
            <div className="dev" key={i}>
              <span className="dev-name">
                {childText(dev, 'DisplayName') ?? '—'}
              </span>
              {simpleFields(dev)
                .filter((f) => f.name !== 'DisplayName')
                .map((f) => (
                  <span className="dev-prop" key={f.name}>
                    {f.value}
                  </span>
                ))}
              <code className="dev-id">{attr(dev, 'developerId')}</code>
            </div>
          ))}
        </div>
      )}

      <UnrecognizedFields nodes={model.rest} context="the export root" />
    </section>
  );
}

/** One labelled figure in the header summary. A `<dt>`/`<dd>` pair, so the
 *  label and value stay associated for assistive tech. */
function Fact({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
