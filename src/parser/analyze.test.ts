import { describe, expect, it } from 'vitest';
import { checkFidelity, collectVocabulary } from './analyze';
import { parseXml } from './parseXml';
import type { XmlNode } from '../types/xmlNode';
import fixture from '../fixtures/sample-script.xml?raw';

const tree = parseXml(fixture);

describe('checkFidelity', () => {
  it('reports the real counts for the sample fixture', () => {
    const report = checkFidelity(tree);

    expect(report.elements).toBe(225);
    expect(report.attributes).toBe(56);
    expect(report.roundTripOk).toBe(true);
    expect(report.dropped).toBe(0);
  });

  it('measures "0 dropped" rather than asserting it', () => {
    const report = checkFidelity(tree);

    // The zero comes from comparing two independently derived counts.
    expect(report.nodesAfterRoundTrip).toBe(report.totalNodes);
    expect(report.totalNodes).toBeGreaterThan(report.elements);
  });

  it('reports failure when a tree cannot round-trip', () => {
    // A node kind the serializer cannot express faithfully: an element whose
    // name is not valid XML. This proves the badge is capable of saying "no".
    const broken: XmlNode = {
      kind: 'element',
      name: 'not a valid name',
      attributes: [],
      children: [],
    };

    const report = checkFidelity(broken);
    expect(report.roundTripOk).toBe(false);
  });

  it('counts a hand-built tree correctly', () => {
    const report = checkFidelity(parseXml('<r a="1" b="2"><c/>text</r>'));

    expect(report.elements).toBe(2);
    expect(report.attributes).toBe(2);
    expect(report.textNodes).toBe(1);
    expect(report.roundTripOk).toBe(true);
    expect(report.dropped).toBe(0);
  });
});

describe('collectVocabulary', () => {
  it('lists every distinct element name in the fixture', () => {
    const vocab = collectVocabulary(tree);
    const names = vocab.map((v) => v.name);

    // Includes the vendor element nothing has special handling for.
    expect(names).toContain('FutureVendorSetting');
    expect(names).toContain('UnknownValue');
    expect(names).toContain('ScriptExport');
    expect(names).toContain('anyType');
  });

  it('counts occurrences and sorts by frequency', () => {
    const vocab = collectVocabulary(tree);

    const anyType = vocab.find((v) => v.name === 'anyType');
    expect(anyType?.count).toBe(10);

    const page = vocab.find((v) => v.name === 'Page');
    expect(page?.count).toBe(3);

    // Descending by count.
    for (let i = 1; i < vocab.length; i += 1) {
      expect(vocab[i - 1]!.count).toBeGreaterThanOrEqual(vocab[i]!.count);
    }
  });

  it('totals back to the element count — nothing is filtered out', () => {
    const vocab = collectVocabulary(tree);
    const total = vocab.reduce((sum, v) => sum + v.count, 0);

    expect(total).toBe(checkFidelity(tree).elements);
  });

  it('picks up a name it has never seen, with no code change', () => {
    const modified = fixture.replace(
      '    <ExportedAt>',
      '    <Wombat purpleness="9">hi</Wombat>\n    <ExportedAt>',
    );
    const names = collectVocabulary(parseXml(modified)).map((v) => v.name);

    expect(names).toContain('Wombat');
  });
});
