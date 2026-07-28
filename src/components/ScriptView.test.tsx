import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScriptView } from './ScriptView';
import { parseXml } from '../parser/parseXml';
import fixture from '../fixtures/sample-script.xml?raw';

/** Render the semantic view to HTML. Node environment, no DOM needed. */
function render(xml: string): string {
  return renderToStaticMarkup(<ScriptView tree={parseXml(xml)} />);
}

const html = render(fixture);

describe('the semantic view presents the whole script', () => {
  it('shows every page, in order', () => {
    const positions = ['Caller Information', 'Call Reason', 'Confirm and Close']
      .map((name) => html.indexOf(name))
      .filter((i) => i >= 0);

    expect(positions).toHaveLength(3);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  it('shows what the operator says, including the after-hours variant', () => {
    expect(html).toContain(
      'Thank you for calling Training Property Management',
    );
    expect(html).toContain('after-hours service');
    expect(html).toContain('May I ask what you are calling about today?');
  });

  it('shows requirements as readable labels, not raw tag names', () => {
    expect(html).toContain('Max chars');
    expect(html).toContain('Input type');
    expect(html).toContain('80');
  });

  it('shows select options in the order an operator reads them', () => {
    const routine = html.indexOf('Routine');
    const urgent = html.indexOf('Urgent');
    const emergency = html.indexOf('Emergency');

    expect(routine).toBeGreaterThan(-1);
    expect(routine).toBeLessThan(urgent);
    expect(urgent).toBeLessThan(emergency);
  });

  it('resolves ids into names a human can read', () => {
    // Developer id -> display name.
    expect(html).toContain('Taulant Matraku');
    // The readback element references five fields by id; their names appear.
    expect(html).toContain('Property or Unit');
    // Navigation resolves to the destination page's name.
    expect(html).toContain('Call Reason');
  });

  it('shows the conditional escalation branch', () => {
    expect(html).toContain('Escalate');
    expect(html).toContain('Follow the emergency escalation procedure.');
  });

  it('shows the completion action', () => {
    expect(html).toContain('Complete call');
    expect(html).toContain('MessageCaptured');
  });

  it('shows page styles', () => {
    expect(html).toContain('StandardInput');
    expect(html).toContain('Inter');
  });
});

describe('the semantic view hides nothing', () => {
  it('surfaces the vendor element the fixture already contains', () => {
    expect(html).toContain('FutureVendorSetting');
    expect(html).toContain('retain-in-json');
    expect(html).toContain('unknown-badge');
  });

  it('renders an element type invented after this code was written', () => {
    const NEW = 'QuantumFlux';
    const ATTRIBUTE = 'resonanceIndex';
    expect(fixture).not.toContain(NEW);
    expect(fixture).not.toContain(ATTRIBUTE);

    const modified = fixture.replace(
      '                <NavType>Screen</NavType>',
      `                <${NEW} ${ATTRIBUTE}="42">retain-me</${NEW}>\n                <NavType>Screen</NavType>`,
    );
    const changed = render(modified);

    // Name, attribute, and text all reach the screen with no code change.
    expect(changed).toContain(NEW);
    expect(changed).toContain(ATTRIBUTE);
    expect(changed).toContain('42');
    expect(changed).toContain('retain-me');
  });

  it('renders an unfamiliar page-level element too', () => {
    const modified = fixture.replace(
      '            <SummaryHeader>Call Reason</SummaryHeader>',
      '            <VendorPageHook mode="beta">page-level</VendorPageHook>\n            <SummaryHeader>Call Reason</SummaryHeader>',
    );
    const changed = render(modified);

    expect(changed).toContain('VendorPageHook');
    expect(changed).toContain('page-level');
  });

  it('marks an empty mode as present rather than rendering nothing', () => {
    // `<XmlSerializiationData />` carries no hint; the card must still say the
    // mode exists, or an empty element would look like a dropped one.
    expect(html).toContain('no overrides');
  });
});

describe('the semantic view degrades instead of crashing', () => {
  it('renders a document that is not a script export at all', () => {
    const out = render('<Something><Else vendor="x">text</Else></Something>');

    // No pages to show, but the unfamiliar content is still displayed.
    expect(out).toContain('Else');
    expect(out).toContain('text');
  });

  it('renders a script with no pages without throwing', () => {
    expect(() =>
      render(
        '<ScriptExport><Client clientId="c"><Name>C</Name></Client><Script><Name>S</Name></Script></ScriptExport>',
      ),
    ).not.toThrow();
  });

  it('renders a document with no root element gracefully', () => {
    // parseXml rejects this, so the view is only reachable with a valid tree;
    // this pins the defensive branch anyway.
    const out = renderToStaticMarkup(
      <ScriptView tree={{ kind: 'document', children: [] }} />,
    );
    expect(out).toContain('no root element');
  });
});
