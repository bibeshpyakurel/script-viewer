import { describe, expect, it } from 'vitest';
import { parseXml } from '../parser/parseXml';
import {
  attr,
  child,
  childElements,
  getPageModel,
  getPages,
  getScriptExport,
  indexDevelopersById,
  indexElementsById,
  indexPagesById,
  partition,
  simpleFields,
  text,
  unknownAttributes,
} from './selectors';
import type { XmlElementNode, XmlNode } from '../types/xmlNode';
import fixture from '../fixtures/sample-script.xml?raw';

const doc = parseXml(fixture);
const model = getScriptExport(doc);
const pages = getPages(model.versions[0]).map(getPageModel);

/** Every element in the tree, in document order. */
function allElements(node: XmlNode): XmlElementNode[] {
  if (node.kind === 'document') return node.children.flatMap(allElements);
  if (node.kind !== 'element') return [];
  return [node, ...node.children.flatMap(allElements)];
}

describe('selectors locate the parts of the export', () => {
  it('finds client, script, and version', () => {
    expect(text(child(model.client, 'Name'))).toBe(
      'Training Property Management',
    );
    expect(attr(model.client, 'clientId')).toBe('training-client-001');
    expect(text(child(model.script, 'Name'))).toBe(
      'Training Property Main Script',
    );
    expect(model.versions).toHaveLength(1);
    expect(attr(model.versions[0], 'versionId')).toBe('training-version-001');
  });

  it('returns the three pages in document order', () => {
    expect(pages.map((p) => p.name)).toEqual([
      'Caller Information',
      'Call Reason',
      'Confirm and Close',
    ]);
    expect(pages.map((p) => p.order)).toEqual(['1', '2', '3']);
  });

  it('reads an element without naming its individual settings', () => {
    const callback = pages[0]?.elements.find(
      (e) => e.id === 'training-callback-number',
    );
    expect(callback).toBeDefined();
    expect(callback?.xsiType).toBe('InputElement');
    expect(callback?.tag).toBe('callback');

    // Requirements are read as generic leaves, so `SaveFormatted` — present on
    // exactly one element in the fixture — needs no special case.
    expect(callback?.requirements.map((f) => [f.name, f.value])).toContainEqual(
      ['SaveFormatted', 'true'],
    );
    expect(callback?.requirements.map((f) => f.name)).toEqual([
      'Required',
      'Readonly',
      'MaxChars',
      'InputType',
      'SaveFormatted',
    ]);
  });

  it('keeps option order, which is what the operator reads', () => {
    const urgency = pages[1]?.elements.find((e) => e.id === 'training-urgency');
    expect(urgency?.options.map((o) => o.value)).toEqual([
      'Routine',
      'Urgent',
      'Emergency',
    ]);
    expect(urgency?.options.map((o) => o.label)).toEqual([
      'Routine',
      'Urgent',
      'Emergency',
    ]);
  });

  it('keeps calc expressions as elements so their attributes survive', () => {
    const callback = pages[0]?.elements.find(
      (e) => e.id === 'training-callback-number',
    );
    const expr = callback?.calcs[0];

    expect(text(expr)).toBe('callback_number != empty');
    expect(attr(expr, 'dataType')).toBe('Boolean');
    expect(attr(expr, 'source')).toBe('training');
  });

  it('reads per-mode hints', () => {
    const callback = pages[0]?.elements.find(
      (e) => e.id === 'training-callback-number',
    );
    expect(callback?.modes.map((m) => m.name)).toEqual([
      'Normal',
      'AfterHours',
    ]);
    expect(callback?.modes[1]?.fields[0]?.value).toBe(
      'Confirm the best callback number',
    );
  });
});

describe('cross-references resolve to something readable', () => {
  it('resolves template field refs to element names', () => {
    const byId = indexElementsById(pages);
    const readback = pages[2]?.elements.find(
      (e) => e.id === 'training-confirmation-readback',
    );

    expect(readback?.templateFieldIds).toHaveLength(5);
    expect(readback?.templateFieldIds.map((id) => byId.get(id)?.name)).toEqual([
      'Caller Name',
      'Callback Number',
      'Property or Unit',
      'Call Reason',
      'Urgency',
    ]);
  });

  it('resolves navigation targets to page names', () => {
    const byPageId = indexPagesById(pages);
    const callback = pages[0]?.elements.find(
      (e) => e.id === 'training-callback-number',
    );

    expect(callback?.navType).toBe('Screen');
    expect(byPageId.get(callback?.navScreen ?? '')?.name).toBe('Call Reason');
  });

  it('resolves the authoring developer id to a display name', () => {
    const byDev = indexDevelopersById(model.developers);
    expect(byDev.get('developer-jordan-avery')).toBe('Jordan Avery');
  });
});

describe('simpleFields reads leaves, not containers', () => {
  it('skips children that have element children of their own', () => {
    const root = parseXml(
      '<r><Leaf>v</Leaf><Container><Inner>x</Inner></Container></r>',
    );
    const fields = simpleFields(childElements(root)[0]);

    expect(fields.map((f) => f.name)).toEqual(['Leaf']);
  });

  it('treats an empty element as a present field with an empty value', () => {
    const root = parseXml('<r><Empty /></r>');
    expect(simpleFields(childElements(root)[0])).toMatchObject([
      { name: 'Empty', value: '' },
    ]);
  });
});

describe('nothing can be silently dropped', () => {
  // This is the guarantee that keeps the semantic view honest. The parser has no
  // allowlist; these tests prove the SELECTORS do not sneak one back in.

  it('partition accounts for every child element', () => {
    for (const el of allElements(doc)) {
      const { recognized, rest } = partition(el, ['Name', 'Id']);
      expect(recognized.length + rest.length).toBe(childElements(el).length);
      // Together they are exactly the children, in no fewer and no more.
      expect([...recognized, ...rest].map((c) => c.name).sort()).toEqual(
        childElements(el)
          .map((c) => c.name)
          .sort(),
      );
    }
  });

  it('surfaces the fixture vendor element as unrecognized rather than hiding it', () => {
    const callback = pages[0]?.elements.find(
      (e) => e.id === 'training-callback-number',
    );

    expect(callback?.rest.map((r) => r.name)).toEqual(['FutureVendorSetting']);
    // With its attributes and nested value intact.
    expect(attr(callback?.rest[0], 'preserve')).toBe('true');
    expect(attr(callback?.rest[0], 'vendorVersion')).toBe('next');
    expect(text(child(callback?.rest[0], 'UnknownValue'))).toBe(
      'retain-in-json',
    );
  });

  it('surfaces an element type that did not exist when this code was written', () => {
    const NEW = 'QuantumFlux';
    expect(fixture).not.toContain(NEW);

    // Injected into a script element, where a real vendor addition would land.
    const modified = fixture.replace(
      '                <NavType>Screen</NavType>',
      `                <${NEW} resonanceIndex="42">retain-me</${NEW}>\n                <NavType>Screen</NavType>`,
    );
    expect(modified).not.toBe(fixture);

    const changed = getScriptExport(parseXml(modified));
    const changedPages = getPages(changed.versions[0]).map(getPageModel);
    const callback = changedPages[0]?.elements.find(
      (e) => e.id === 'training-callback-number',
    );

    // No code in selectors.ts mentions this name, yet it arrives intact.
    const added = callback?.rest.find((r) => r.name === NEW);
    expect(added).toBeDefined();
    expect(attr(added, 'resonanceIndex')).toBe('42');
    expect(text(added)).toBe('retain-me');

    // And it keeps its position relative to the fields around it.
    const restNames = callback?.rest.map((r) => r.name);
    expect(restNames).toEqual([NEW, 'FutureVendorSetting']);
  });

  it('surfaces an unrecognized child of a page too', () => {
    const modified = fixture.replace(
      '            <SummaryHeader>Call Reason</SummaryHeader>',
      '            <VendorPageHook mode="beta" />\n            <SummaryHeader>Call Reason</SummaryHeader>',
    );

    const changed = getScriptExport(parseXml(modified));
    const changedPages = getPages(changed.versions[0]).map(getPageModel);

    expect(changedPages[1]?.rest.map((r) => r.name)).toContain(
      'VendorPageHook',
    );
  });

  it('reports XmlNodes on page one as unrecognized, not missing', () => {
    // The fixture's own `<XmlNodes><XmlSharedActionsNode /></XmlNodes>` is not
    // named by PAGE_KNOWN, so it must show up in `rest`.
    expect(pages[0]?.rest.map((r) => r.name)).toContain('XmlNodes');
  });
});

describe('unknownAttributes covers the other axis', () => {
  const firstPage = pages[0];
  if (!firstPage) throw new Error('the fixture should have pages');
  const pageNode = firstPage.node;

  it('returns an attribute the caller did not name', () => {
    expect(unknownAttributes(pageNode, ['pageId'])).toEqual([
      { name: 'order', value: '1' },
    ]);
  });

  it('returns nothing when every attribute is named', () => {
    expect(unknownAttributes(pageNode, ['pageId', 'order'])).toEqual([]);
  });

  it('never reports namespace declarations', () => {
    // The root carries xmlns:xsi and xmlns:xsd plus two real attributes.
    expect(unknownAttributes(model.root, []).map((a) => a.name)).toEqual([
      'schemaVersion',
      'environment',
    ]);
  });

  it('tolerates a missing node', () => {
    expect(unknownAttributes(undefined, [])).toEqual([]);
  });

  it('leaves no attribute unaccounted for on a page', () => {
    // Every attribute is either one the model names or one it surfaces.
    const named = ['pageId', 'order'];
    expect(named.length + firstPage.restAttributes.length).toBe(
      pageNode.attributes.length,
    );
  });

  it('surfaces an attribute that did not exist when this code was written', () => {
    const ATTRIBUTE = 'experimentalFlag';
    expect(fixture).not.toContain(ATTRIBUTE);

    const modified = parseXml(
      fixture.replace(
        '<Page pageId="training-page-call-reason" order="2">',
        `<Page pageId="training-page-call-reason" order="2" ${ATTRIBUTE}="beta">`,
      ),
    );
    const secondPage = getPages(getScriptExport(modified).versions[0])[1];
    if (!secondPage) throw new Error('expected a second page');

    expect(getPageModel(secondPage).restAttributes).toEqual([
      { name: ATTRIBUTE, value: 'beta' },
    ]);
  });
});

describe('selectors tolerate a document shaped differently', () => {
  it('returns empty results instead of throwing on an unrelated document', () => {
    const other = getScriptExport(parseXml('<Something><Else /></Something>'));

    expect(other.client).toBeUndefined();
    expect(other.script).toBeUndefined();
    expect(other.versions).toEqual([]);
    expect(getPages(other.versions[0])).toEqual([]);
    // The unfamiliar content is still reported, not swallowed.
    expect(other.rest.map((r) => r.name)).toEqual(['Else']);
  });
});
