import { describe, expect, it } from 'vitest';
import { breakFixture } from './SourcePicker';
import { safeParseXml } from '../parser/parseXml';
import fixture from '../fixtures/sample-script.xml?raw';

describe('the "load a broken file" demo', () => {
  // Without these, a change to the fixture could leave the button loading a
  // perfectly valid document — the demo would still "work" and prove nothing.
  it('actually produces XML the parser rejects', () => {
    const result = safeParseXml(breakFixture());

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected the broken sample to fail');
    expect(result.error.message).toContain('entity not found');
  });

  it('changes the fixture rather than returning it unmodified', () => {
    // Catches the anchor string silently ceasing to match.
    expect(breakFixture()).not.toBe(fixture);
  });

  it('never mutates the supplied fixture itself', () => {
    const before = fixture;
    breakFixture();

    expect(fixture).toBe(before);
    expect(safeParseXml(fixture).ok).toBe(true);
  });

  it('demonstrates the RECOVERED class of error, not a fatal one', () => {
    // The point of the demo: xmldom hands back a usable-looking tree for this
    // input. Being rejected anyway is the behavior worth showing.
    const issues = safeParseXml(breakFixture());
    if (issues.ok) throw new Error('expected failure');

    expect(issues.error.issues.some((i) => i.level === 'error')).toBe(true);
    expect(issues.error.issues.some((i) => i.level === 'fatalError')).toBe(
      false,
    );
  });
});
