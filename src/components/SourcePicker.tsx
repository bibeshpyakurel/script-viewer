import { useId, useRef, useState } from 'react';
import fixture from '../fixtures/sample-script.xml?raw';

/**
 * Chooses which XML the app parses.
 *
 * Two jobs, and the second is the less obvious one:
 *
 * 1. **Open a real file.** The parser has always taken a string, so making the
 *    app work on any export rather than only the bundled fixture is a file
 *    input and nothing else.
 * 2. **Make the error path reachable.** Rejecting malformed XML is one of the
 *    most carefully built parts of this project and, with only a valid fixture
 *    bundled, it was impossible to see without editing code. "Load a broken
 *    file" injects a fault into a copy of the fixture — the fixture itself is
 *    never touched — so the failure behavior can be demonstrated in one click.
 *
 * The injected fault is deliberately an **undefined entity**, not an unclosed
 * tag. xmldom treats a broken tag as fatal and throws, which any parser would
 * catch. It *recovers* from an undefined entity, silently returning a tree that
 * misrepresents the file. That quiet case is the one this project handles and
 * the one worth showing.
 */
export function SourcePicker({
  current,
  isFixture,
  onLoad,
  onReset,
}: {
  current: string;
  isFixture: boolean;
  onLoad: (label: string, xml: string) => void;
  onReset: () => void;
}) {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [readError, setReadError] = useState<string | null>(null);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setReadError(null);
    try {
      onLoad(file.name, await file.text());
    } catch (error) {
      // Reading can fail independently of parsing (permissions, a vanished
      // file). Surfaced here rather than mislabelled as a parse failure.
      setReadError(
        `Could not read ${file.name}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    // Clear the input so choosing the same file twice fires `change` again.
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="source">
      <div className="source-row">
        <label className="btn" htmlFor={inputId}>
          Open XML file
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".xml,application/xml,text/xml"
          onChange={(e) => void handleFile(e.target.files?.[0])}
        />

        <button
          type="button"
          className="btn"
          onClick={() => onLoad('broken-sample.xml', breakFixture())}
          title="Loads a copy of the sample with an undefined entity, to show how parse failures are reported"
        >
          Load a broken file
        </button>

        {!isFixture && (
          <button type="button" className="btn" onClick={onReset}>
            Back to sample
          </button>
        )}
      </div>

      <p className="source-current">
        Showing <code>{current}</code>
        {isFixture && <span className="source-tag">bundled fixture</span>}
      </p>

      {readError && (
        <p className="source-error" role="alert">
          {readError}
        </p>
      )}
    </div>
  );
}

/**
 * A copy of the fixture with one undefined entity introduced.
 *
 * Built at call time from the imported string; the fixture on disk is read-only
 * input and is never modified.
 *
 * Exported for its test: if the anchor string below ever stops matching the
 * fixture, this would silently return VALID XML and the demo would quietly
 * stop demonstrating anything. A test asserts the result really fails to parse.
 */
export function breakFixture(): string {
  return fixture.replace(
    '<Status>Active</Status>',
    '<Status>Active &undefinedEntity;</Status>',
  );
}
