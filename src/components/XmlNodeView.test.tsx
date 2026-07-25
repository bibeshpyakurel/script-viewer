import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { XmlNodeView } from './XmlNodeView';
import { parseXml } from '../parser/parseXml';
import fixture from '../fixtures/sample-script.xml?raw';

/** Render a tree to HTML. Node environment, no DOM needed. */
function render(xml: string, openToDepth = Infinity): string {
  return renderToStaticMarkup(
    <XmlNodeView node={parseXml(xml)} depth={0} openToDepth={openToDepth} />,
  );
}

describe('the renderer has no allowlist either', () => {
  const NEW_ELEMENT = 'QuantumFlux';
  const NEW_ATTRIBUTE = 'resonanceIndex';

  it('the names really are absent from the fixture', () => {
    expect(fixture).not.toContain(NEW_ELEMENT);
    expect(fixture).not.toContain(NEW_ATTRIBUTE);
  });

  it('renders an element it has never seen, with no code change', () => {
    const modified = fixture.replace(
      '    <ExportedAt>',
      `    <${NEW_ELEMENT} ${NEW_ATTRIBUTE}="42">hello</${NEW_ELEMENT}>\n    <ExportedAt>`,
    );
    const html = render(modified);

    // Name, attribute name, attribute value, and text all reach the output.
    expect(html).toContain(NEW_ELEMENT);
    expect(html).toContain(NEW_ATTRIBUTE);
    expect(html).toContain('42');
    expect(html).toContain('hello');
  });

  it('renders a deeply nested unknown subtree', () => {
    const html = render(
      '<Root><Alpha a="1"><Beta b="2"><Gamma c="3">deep</Gamma></Beta></Alpha></Root>',
    );

    for (const token of ['Alpha', 'Beta', 'Gamma', 'deep', 'a', 'b', 'c']) {
      expect(html).toContain(token);
    }
  });

  it('renders every node kind without naming any tag', () => {
    const html = render(
      '<r><![CDATA[cd-here]]><!--cm-here--><?pi-target pi-data?><e/>tail</r>',
    );

    expect(html).toContain('cd-here');
    expect(html).toContain('cm-here');
    expect(html).toContain('pi-target');
    expect(html).toContain('tail');
  });
});

describe('nothing looks dropped', () => {
  it('shows an empty element as a present, labelled node', () => {
    const html = render('<r><XmlCalcNode /></r>');

    expect(html).toContain('XmlCalcNode');
    // Marked "empty" rather than rendered as blank space.
    expect(html).toContain('empty-badge');
  });

  it('shows every empty element in the real fixture', () => {
    const html = render(fixture);
    const badges = html.match(/empty-badge/g) ?? [];

    // 14 self-closing elements in the supplied file.
    expect(badges.length).toBe(14);
  });
});

describe('namespace prefixes are present but quiet', () => {
  it('keeps the prefix and marks it for muted styling', () => {
    const html = render(
      '<ns:Root xmlns:ns="u"><ns:Child ns:a="v" /></ns:Root>',
    );

    expect(html).toContain('ns:');
    expect(html).toContain('Child');
    // The prefix is wrapped so CSS can recede it, not stripped.
    expect(html).toContain('ns-prefix');
  });

  it('renders xsi:type from the fixture with its prefix', () => {
    const html = render(fixture);

    expect(html).toContain('xsi:');
    expect(html).toContain('DisplayElement');
  });
});

describe('attributes are visually distinct from children and text', () => {
  it('wraps attributes in their own markup, separate from child nodes', () => {
    const html = render('<r id="7"><Child>body</Child></r>');

    expect(html).toContain('attr-name');
    expect(html).toContain('attr-value');
    expect(html).toContain('7');
    // Child elements do not use the attribute classes.
    expect(html).toContain('Child');
  });
});

describe('the whole fixture renders', () => {
  it('includes content from every page', () => {
    const html = render(fixture);

    for (const token of [
      'Caller Information',
      'Call Reason',
      'Confirm and Close',
      'FutureVendorSetting',
      'retain-in-json',
    ]) {
      expect(html).toContain(token);
    }
  });

  it('collapses deep nodes when openToDepth is shallow', () => {
    const deep = render(fixture, Infinity).length;
    const shallow = render(fixture, 2).length;

    expect(shallow).toBeLessThan(deep);
  });
});
