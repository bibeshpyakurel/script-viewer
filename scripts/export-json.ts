/**
 * Convert an XML script export to JSON on disk.
 *
 * The app shows the parsed JSON in its JSON tab, but reading it that way means
 * running the app first. This produces a file that
 * can be opened, diffed, piped into `jq`, or read straight from the repo.
 *
 * Usage:
 *   npm run export:json                    # fixture -> parsed/sample-script.json
 *   npm run export:json -- in.xml          # a different input, same default out
 *   npm run export:json -- in.xml -o -     # write to stdout
 *   npm run export:json -- --check         # verify the committed file is current
 *
 * `--check` is what CI runs. It regenerates the JSON in memory and compares, so
 * a committed artifact can never drift from the parser that produced it.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseXml, XmlParseError } from '../src/parser/parseXml';
import { checkFidelity, collectVocabulary } from '../src/parser/analyze';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_INPUT = 'src/fixtures/sample-script.xml';
const DEFAULT_OUTPUT = 'parsed/sample-script.json';

interface Options {
  input: string;
  /** Destination path, or `-` for stdout. */
  output: string;
  check: boolean;
}

/**
 * Minimal hand-rolled argument parsing.
 *
 * Four flags do not justify a dependency, and keeping `scripts/` free of extra
 * packages means the export can run from a clean checkout with nothing beyond
 * what the app already needs.
 */
function parseArgs(argv: readonly string[]): Options {
  const positional: string[] = [];
  let output = DEFAULT_OUTPUT;
  let check = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') {
      check = true;
    } else if (arg === '-o' || arg === '--out') {
      const next = argv[i + 1];
      if (next === undefined) fail('Missing path after --out.');
      output = next;
      i += 1;
    } else if (arg !== undefined) {
      positional.push(arg);
    }
  }

  return { input: positional[0] ?? DEFAULT_INPUT, output, check };
}

/**
 * Report a problem and exit non-zero.
 *
 * The `never` return lets callers use this in place of a value without the
 * compiler complaining about a missing branch, and the non-zero exit is what
 * makes `--check` usable as a CI gate.
 */
function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

/**
 * Read the XML, parse it, and either write the JSON or verify what is on disk.
 *
 * The tree is checked for round-trip fidelity before anything is written, so a
 * parser regression fails the export rather than quietly committing a degraded
 * artifact.
 */
function main(): void {
  const options = parseArgs(process.argv.slice(2));
  const inputPath = resolve(repoRoot, options.input);

  let xml: string;
  try {
    xml = readFileSync(inputPath, 'utf8');
  } catch {
    fail(`Could not read ${options.input}`);
  }

  let json: string;
  try {
    const tree = parseXml(xml);
    // Two-space indent: readable in a browser and diff-friendly in review.
    json = `${JSON.stringify(tree, null, 2)}\n`;

    const fidelity = checkFidelity(tree);
    const vocabulary = collectVocabulary(tree);
    // Written to stderr so `-o -` can be piped without corrupting the JSON.
    console.error(
      [
        `${options.input}:`,
        `  ${fidelity.elements} elements, ${fidelity.attributes} attributes,`,
        `${fidelity.totalNodes} nodes total`,
        `  ${vocabulary.length} distinct element names`,
        `  round trip: ${fidelity.roundTripOk ? 'verified' : 'FAILED'},`,
        `${fidelity.dropped} nodes dropped`,
      ].join(' '),
    );

    if (!fidelity.roundTripOk) {
      fail('Refusing to write: this tree does not survive a round trip.');
    }
  } catch (error) {
    if (error instanceof XmlParseError) {
      fail(`Parse failed for ${options.input}:\n${error.message}`);
    }
    throw error;
  }

  if (options.check) {
    const target = resolve(repoRoot, options.output);
    let committed: string;
    try {
      committed = readFileSync(target, 'utf8');
    } catch {
      fail(
        `${options.output} is missing. Run \`npm run export:json\` and commit it.`,
      );
    }
    if (committed !== json) {
      fail(
        `${options.output} is out of date. Run \`npm run export:json\` and commit the result.`,
      );
    }
    console.error(`${options.output} is up to date.`);
    return;
  }

  if (options.output === '-') {
    process.stdout.write(json);
    return;
  }

  const target = resolve(repoRoot, options.output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json, 'utf8');
  console.error(`Wrote ${relative(repoRoot, target)}`);
}

main();
