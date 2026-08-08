# Script Viewer

**Live app: https://bibeshpyakurel.github.io/script-viewer/**

Call-center scripting platforms build scripts in a GUI and store them as XML —
pages, input fields, requirements, display settings, navigation, and vendor
configuration all nested together in a form that is painful to review by hand.
This is a viewer for those files: it parses an export into JSON and presents it
three ways.

| Tab        | Answers                                                       |
| ---------- | ------------------------------------------------------------- |
| **Script** | _What does this script do?_ The call, page by page, in order. |
| **Tree**   | _What is in this file?_ Every node exactly as parsed.         |
| **JSON**   | _What did the parser actually produce?_ The raw tree.         |

The design rests on one idea: **a single uniform node type represents any XML
node**, so the parser has no knowledge of the format's vocabulary. An element it
has never seen survives with its name, attributes, parent, and sibling position
intact, with no code change. That property is enforced by tests rather than
asserted in prose, and the app reports it on screen.

The Script view is built on the same guarantee. It reads the parsed tree through
selectors, and anything it has no styled presentation for is rendered in full
under an **unrecognized** badge rather than skipped — so a domain-aware UI still
cannot hide a field. The bundled sample exercises this: its
`<FutureVendorSetting>` appears on screen without a line of code naming it.

---

## Quick start

Requires **Node 20.19+** (or 22.12+) and npm. CI runs on Node 20.

```bash
npm ci        # install exactly what the lockfile pins
npm run dev   # start the dev server
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Scripts

| Command                     | What it does                             |
| --------------------------- | ---------------------------------------- |
| `npm run dev`               | Dev server with hot reload               |
| `npm run build`             | Production build to `dist/`              |
| `npm run preview`           | Serve the production build locally       |
| `npm test`                  | Run the test suite once                  |
| `npm run lint`              | ESLint                                   |
| `npm run typecheck`         | `tsc --noEmit`                           |
| `npm run format`            | Rewrite files with Prettier              |
| `npm run export:json`       | Regenerate `parsed/sample-script.json`   |
| `npm run export:json:check` | Fail if that artifact is stale (CI runs) |

## The JSON, without running anything

[`parsed/sample-script.json`](parsed/sample-script.json) is the parsed fixture,
committed so it can be read, diffed, or piped into `jq` without starting the app.
It is generated, never hand-written:

```bash
npm run export:json                 # regenerate it
npm run export:json -- --check      # verify it matches the parser (CI does this)
npm run export:json -- in.xml -o -  # any file, to stdout
```

CI runs the check, so the artifact cannot drift from the parser that produced it.
The first entries in that file are the XML declaration and the whitespace after
it — the prolog is part of the parsed result, not discarded.

## Tests

```bash
npm test
```

109 tests. They prove the properties the project depends on rather than just
exercising the code:

- **No allowlist** — an element and attribute that appear nowhere in the fixture
  are injected, parsed, and checked for name, attribute name/value, parent, and
  sibling position. A separate test asserts those names really are absent, so
  the test cannot decay into a no-op. The same is proven for the tree renderer,
  the selectors, and the Script view.
- **Same-name siblings** — the three `<Page>` elements stay three ordered
  children, not one.
- **Empty elements** — `<XmlCalcNode />` is a real node with `children: []`.
- **Attribute order and namespaces** — including `xmlns:xsd`, which the fixture
  declares and never uses.
- **Whitespace fidelity** — indentation text nodes are kept, not silently
  dropped.
- **Document prolog** — the XML declaration is captured, positioned before the
  root, and re-emitted on serialize.
- **Round trip** — `parse → serialize → parse` produces a deeply equal tree.
- **Malformed input** — invalid XML is rejected with a readable message, never
  half-parsed. Including the cases xmldom would otherwise recover from silently.
- **Nothing can be dropped** — for every element in the fixture, `partition()`
  is checked to account for every child and `unknownAttributes()` for every
  attribute. A field is either recognized or explicitly unrecognized; there is
  no third outcome. A separate test injects an attribute absent from the
  fixture and proves it reaches the screen.
- **The broken-file demo really is broken** — otherwise a fixture change could
  leave that button quietly loading valid XML.

See [DECISIONS.md](DECISIONS.md) for why each choice was made.

## Project structure

```
src/
  types/       The one node type every other file is built around. Read first.
  parser/      XML -> XmlNode tree, back again, and analysis over the tree.
  script/      Read-only selectors. The only place that knows the format's names.
  components/  React UI: the semantic view, the generic tree renderer, panels.
  fixtures/    The sample export. Read-only input, pinned by tests.
  main.tsx     React entry point.
scripts/       CLI entry points (XML -> JSON).
parsed/        Generated JSON artifact. Do not hand-edit.
```

| File                                | Purpose                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `types/xmlNode.ts`                  | The uniform node type, and why it is shaped that way |
| `parser/parseXml.ts`                | String → tree. Generic; no tag name appears in it    |
| `parser/serializeXml.ts`            | Tree → string. Exists to make fidelity provable      |
| `parser/analyze.ts`                 | Fidelity measurement and element vocabulary          |
| `script/selectors.ts`               | Domain lookup layer; cannot drop a field             |
| `components/ScriptView.tsx`         | The semantic view: overview, call flow, pages        |
| `components/ScriptElementCard.tsx`  | One script element, as a reviewer reads it           |
| `components/XmlNodeView.tsx`        | The generic recursive renderer                       |
| `components/UnrecognizedFields.tsx` | Fallback for anything the Script view cannot style   |
| `components/SourcePicker.tsx`       | File upload, and the deliberately broken sample      |
| `components/App.tsx`                | Source and tab state, error path, layout             |

**Read `src/types/xmlNode.ts` first.** It is the contract the rest of the
project is built around, and its doc comment explains the reasoning.

Working on this with an AI coding tool? Start at [AGENTS.md](AGENTS.md).

### Why a domain-aware view does not reintroduce an allowlist

`src/script/selectors.ts` is the one file that knows what a `<Page>` is. That is
safe because it is a lookup layer, not a parse step: it runs after parsing, it is
never the only path to a value, and it **cannot drop a field**. Each selector
splits an element's children into the names it handles and a `rest` array, and
splits its attributes the same way via `unknownAttributes()`. Every view renders
both through `UnrecognizedFields`. Unrecognized is a rendering mode, not a filter
— the worst an unfamiliar field suffers is plainer styling. Tests assert this on
both axes, including for an attribute that exists nowhere in the fixture.

The fixture is treated as read-only input. It is listed in `.prettierignore` so
formatting can never rewrite it, and it is loaded via Vite's `?raw` import as an
immutable string.

## How the parser preserves everything

`parseXml` hands the string to `@xmldom/xmldom`, then walks the resulting DOM
recursively. Its **only branch is a `switch` on `node.nodeType`** — element,
text, CDATA, comment, processing instruction. That is a closed set fixed by the
XML spec, not a list of things this project happens to know about. No branch
anywhere compares a tag or attribute name, so a name it has never seen takes the
identical code path as one it has.

Four things follow from that, and each is what makes the result lossless:

- **The document, not the root element, is returned.** The XML declaration and
  anything else in the prolog are children of the document, siblings of the
  root. Starting at the root would drop the sample file's first line.
- **Names are copied verbatim**, namespace prefix included — `xsi:type`, not
  `type`. Elements use `tagName`, never `localName`.
- **Attributes are an ordered array** of `{ name, value }`, not an object. An
  object would lose order, collapse duplicate names, and mishandle namespace
  declarations. The fixture proves the last point: it declares `xmlns:xsd` and
  never uses it, so a parser that recorded only namespaces _in use_ would drop
  it silently.
- **Children are an ordered array.** Sibling order is meaning — three `<Option>`
  values are a dropdown an operator reads top to bottom.
- **Empty elements are real nodes** with `children: []`, never `null` or an
  omitted field. The fixture has 14 of them.

Malformed input is rejected rather than half-parsed. That needs explicit work:
xmldom _throws_ only on fatal errors, and quietly **recovers** from several
genuinely broken documents. `parseXml` captures the parser's error handler and
refuses anything that reports a problem, so a partial tree never reaches the UI.

The app reports its own fidelity on screen — element and attribute counts,
nodes dropped, and a live `parse → serialize → parse` round-trip check. The
"0 dropped" figure is computed by re-deriving the tree and comparing, not
printed as a constant.

## CI

`.github/workflows/ci.yml` runs on every push and pull request, from a clean
checkout on Node 20:

```
npm ci → lint → typecheck → test → export:json:check → build
```

Any failing step fails the job. `export:json:check` regenerates the committed
JSON artifact and compares it, so it cannot drift from the parser.

## Deployment

`.github/workflows/deploy.yml` builds and publishes to GitHub Pages on every
push to `main`. No manual step.

Asset paths are configurable rather than hardcoded: `vite.config.ts` reads
`VITE_BASE` and defaults to `/`. That default is correct for local preview and
for any host serving from a domain root; the deploy workflow sets
`/script-viewer/` because Pages serves from a subpath.

```bash
npm run build                          # root-relative, for local preview
VITE_BASE=/script-viewer/ npm run build # what CI publishes
```

## Current status

Working and covered by tests:

- Parser, serializer, and the full fidelity suite, including the document prolog
- **Script view** — client, script, version, the call flow, and every page with
  its elements, prompts, requirements, options, modes, calculations, conditional
  actions, navigation, styles, and completion action. Cross-references resolve:
  field refs and navigation targets render as names, not ids.
- **Unrecognized fields surfaced, not hidden** — anything the Script view cannot
  style is rendered in full with a badge, on both axes: child elements and
  attributes. Proven by tests that inject an element and an attribute absent
  from the fixture
- Generic collapsible tree view, with the same no-allowlist guarantee
- Parsed JSON viewable and copyable in the UI, and committed as a file
- A measured fidelity indicator: element/attribute counts, nodes dropped, and a
  live round-trip check
- The document's full element vocabulary, derived by walking the tree
- **File upload**, so the tool works on any export rather than only the fixture
- Malformed XML renders a clear error panel instead of a blank screen — and
  "Load a broken file" makes that path reachable in one click
- CI green on every commit

Not yet complete, in the order I would pick them up:

1. Search and filter
2. Deep linking
3. Property-based testing
4. Accessibility audit
5. Virtualized rendering

[DECISIONS.md](DECISIONS.md) explains why each is next, and what was left out
on purpose.
