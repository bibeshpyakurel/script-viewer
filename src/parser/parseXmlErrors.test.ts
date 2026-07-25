import { describe, expect, it } from 'vitest';
import { XmlParseError, parseXml, safeParseXml } from './parseXml';
import fixture from '../fixtures/sample-script.xml?raw';

/** Malformed inputs xmldom treats as FATAL — it throws on its own. */
const fatal = {
  'unclosed tag': '<a><b></a>',
  'mismatched nesting': '<a><b></a></b>',
  'duplicate attribute': '<a x="1" x="2"/>',
  'two root elements': '<a/><b/>',
  'unclosed comment': '<a><!-- x</a>',
  'truncated mid-attribute': '<a><b attr="',
};

/**
 * Malformed inputs xmldom RECOVERS from, handing back a usable-looking tree.
 * These are the dangerous ones: without the `onError` handler they would parse
 * "successfully" into a document that misrepresents the source.
 */
const recovered = {
  'undefined entity': '<a>&nope;</a>',
  'unquoted attribute value': '<a x=1/>',
  'text outside the root element': 'junk<a/>',
};

describe('malformed XML is rejected, never half-parsed', () => {
  it.each(Object.entries(fatal))('rejects %s', (_label, xml) => {
    expect(() => parseXml(xml)).toThrow(XmlParseError);
  });

  it.each(Object.entries(recovered))(
    'rejects %s even though the parser could recover',
    (_label, xml) => {
      expect(() => parseXml(xml)).toThrow(XmlParseError);
    },
  );

  it('rejects input that is not XML at all', () => {
    expect(() => parseXml('hello world')).toThrow(XmlParseError);
    expect(() => parseXml('')).toThrow(XmlParseError);
  });

  it('never returns a partial tree', () => {
    // Every malformed case throws, so no caller can receive a broken tree.
    for (const xml of [...Object.values(fatal), ...Object.values(recovered)]) {
      let returned: unknown = 'NOTHING_RETURNED';
      try {
        returned = parseXml(xml);
      } catch {
        /* expected */
      }
      expect(returned).toBe('NOTHING_RETURNED');
    }
  });
});

describe('the error message is readable', () => {
  it('names the actual problem, not just "parse failed"', () => {
    let message = '';
    try {
      parseXml('<a><b></a>');
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain('Invalid XML');
    // The specific cause, in words a human can act on.
    expect(message).toContain('mismatch');
    expect(message).toContain('b');
    expect(message).toContain('a');
  });

  it('explains a recovered error rather than staying silent', () => {
    let message = '';
    try {
      parseXml('<a>&nope;</a>');
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).toContain('Invalid XML');
    expect(message).toContain('entity not found');
  });

  it('carries the structured issues alongside the message', () => {
    try {
      parseXml('junk<a/>');
      expect.unreachable('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(XmlParseError);
      const issues = (e as XmlParseError).issues;
      expect(issues.length).toBeGreaterThan(0);
      expect(issues[0]?.level).toBe('error');
      expect(issues[0]?.message).toContain('outside root element');
    }
  });

  it('does not double-count a single problem', () => {
    // xmldom reports a fatal problem via onError AND throws it. Reporting one
    // broken tag as "2 problems" would be misleading.
    let message = '';
    try {
      parseXml('<a><b></a>');
    } catch (e) {
      message = (e as Error).message;
    }

    expect(message).not.toContain('problems');
    expect(message.split('\n')).toHaveLength(1);
    // Counted once, not twice.
    expect(message.match(/mismatch/g)).toHaveLength(1);
  });

  it('reports every problem when there is more than one', () => {
    let message = '';
    try {
      parseXml('<a x=1 y=2/>');
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toContain('problems');
  });
});

describe('safeParseXml returns the failure instead of throwing', () => {
  it('gives ok: true and the tree for valid XML', () => {
    const result = safeParseXml(fixture);

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected success');
    expect(result.tree.kind).toBe('element');
  });

  it('gives ok: false and a readable error for invalid XML', () => {
    const result = safeParseXml('<a><b></a>');

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('expected failure');
    expect(result.error).toBeInstanceOf(XmlParseError);
    expect(result.error.message).toContain('Invalid XML');
    // The UI can render this directly instead of blanking the screen.
    expect(result.error.message.length).toBeGreaterThan(20);
  });

  it('does not throw, for any malformed input', () => {
    for (const xml of [...Object.values(fatal), ...Object.values(recovered)]) {
      expect(() => safeParseXml(xml)).not.toThrow();
      expect(safeParseXml(xml).ok).toBe(false);
    }
  });
});

describe('valid input is unaffected', () => {
  it('parses the supplied fixture with no errors', () => {
    expect(() => parseXml(fixture)).not.toThrow();
    expect(safeParseXml(fixture).ok).toBe(true);
  });
});
