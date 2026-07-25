import { useState } from 'react';
import type { VocabularyEntry } from '../parser/analyze';

/**
 * The complete element vocabulary of the parsed document.
 *
 * This is the "unknown fields survived" proof, done without an allowlist. The
 * renderer has no special handling for ANY name, so there is no meaningful
 * "known" set to contrast against — listing a curated set of "unknown" tags
 * would mean hard-coding exactly the list this project exists to avoid.
 *
 * Showing the whole vocabulary is the stronger claim: every name in the file is
 * here, including ones nobody anticipated. A name cannot be missing, because
 * nothing decides what belongs.
 */
export function VocabularyPanel({
  vocabulary,
}: {
  vocabulary: VocabularyEntry[];
}) {
  const [open, setOpen] = useState(false);
  const singletons = vocabulary.filter((v) => v.count === 1).length;

  return (
    <section className="vocab">
      <button
        type="button"
        className="btn"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {open ? 'Hide' : 'Show'} element vocabulary
      </button>
      <span className="hint">
        {vocabulary.length} distinct names, all retained
        {singletons > 0 && ` · ${singletons} appear once`}
      </span>

      {open && (
        <>
          <ul className="vocab-list">
            {vocabulary.map((entry) => (
              <li
                key={entry.name}
                className={`vocab-item${entry.count === 1 ? ' vocab-rare' : ''}`}
              >
                <span className="vocab-name">
                  <QualifiedName name={entry.name} />
                </span>
                <span className="vocab-count">{entry.count}</span>
              </li>
            ))}
          </ul>
          <p className="vocab-note">
            Built by walking the parsed tree, not from a list of expected names.
            An element type this project has never seen appears here
            automatically.
          </p>
        </>
      )}
    </section>
  );
}

/** Mutes any namespace prefix. Splits on the first colon, whatever it is. */
function QualifiedName({ name }: { name: string }) {
  const colon = name.indexOf(':');
  if (colon === -1) return <>{name}</>;
  return (
    <>
      <span className="ns-prefix">{name.slice(0, colon + 1)}</span>
      {name.slice(colon + 1)}
    </>
  );
}
