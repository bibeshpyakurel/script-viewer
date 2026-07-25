# Script Viewer

**Live app: https://bibeshpyakurel.github.io/script-viewer/**

AnSer builds call-center scripts in a GUI and stores them as XML — pages, input
fields, requirements, display settings, navigation, and vendor configuration all
nested together in a form that is painful to review by hand. This is a viewer
for those files: it parses an export into JSON and renders it as a browsable,
collapsible tree, so a reviewer can scan the structure of a script and drill
into any part of it without reading raw XML.

The design rests on one idea: **a single uniform node type represents any XML
node**, so the parser has no knowledge of AnSer's vocabulary. An element it has
never seen survives with its name, attributes, parent, and sibling position
intact, with no code change. That property is enforced by tests rather than
asserted in prose, and the app reports it on screen.

---

## Quick start

Requires **Node 20.19+** (or 22.12+) and npm. CI runs on Node 20.

```bash
npm ci        # install exactly what the lockfile pins
npm run dev   # start the dev server
```

Then open the URL Vite prints (usually `http://localhost:5173`).

## Scripts

| Command             | What it does                       |
| ------------------- | ---------------------------------- |
| `npm run dev`       | Dev server with hot reload         |
| `npm run build`     | Production build to `dist/`        |
| `npm run preview`   | Serve the production build locally |
| `npm test`          | Run the test suite once            |
| `npm run lint`      | ESLint                             |
| `npm run typecheck` | `tsc --noEmit`                     |
| `npm run format`    | Rewrite files with Prettier        |

## Tests

```bash
npm test
```

54 tests. They prove the properties the project depends on rather than just
exercising the code:

- **No allowlist** — an element and attribute that appear nowhere in the fixture
  are injected, parsed, and checked for name, attribute name/value, parent, and
  sibling position. A separate test asserts those names really are absent, so
  the test cannot decay into a no-op.
- **Same-name siblings** — the three `<Page>` elements stay three ordered
  children, not one.
- **Empty elements** — `<XmlCalcNode />` is a real node with `children: []`.
- **Attribute order and namespaces** — including `xmlns:xsd`, which the fixture
  declares and never uses.
- **Whitespace fidelity** — indentation text nodes are kept, not silently
  dropped.
- **Round trip** — `parse → serialize → parse` produces a deeply equal tree.
- **Malformed input** — invalid XML is rejected with a readable message, never
  half-parsed. Including the cases xmldom would otherwise recover from silently.

See [DECISIONS.md](DECISIONS.md) for why each choice was made.

## Project structure

```
src/
  types/       The one node type every other file is built around. Read first.
  parser/      XML -> XmlNode tree, back again, and analysis over the tree.
  components/  React UI: the generic tree renderer and its panels.
  fixtures/    The supplied export, byte-for-byte unchanged. Read-only input.
  main.tsx     React entry point.
```

| File                         | Purpose                                                |
| ---------------------------- | ------------------------------------------------------ |
| `types/xmlNode.ts`           | The uniform node type, and why it is shaped that way   |
| `parser/parseXml.ts`         | String → tree. Generic; no tag name appears in it      |
| `parser/serializeXml.ts`     | Tree → string. Exists to make fidelity provable        |
| `parser/analyze.ts`          | Fidelity measurement and element vocabulary            |
| `components/XmlNodeView.tsx` | The generic recursive renderer                         |
| `components/App.tsx`         | Loads the fixture, handles the error path, lays out UI |

**Read `src/types/xmlNode.ts` first.** It is the contract the rest of the
project is built around, and its doc comment explains the reasoning.

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
npm ci → lint → typecheck → test → build
```

Any failing step fails the job.

## Current status

Working and covered by tests:

- Parser, serializer, and the full fidelity suite
- Generic collapsible tree view, with the same no-allowlist guarantee as the
  parser — proven by a test that renders an element absent from the fixture
- Parsed JSON viewable and copyable in the UI
- A measured fidelity indicator: element/attribute counts, nodes dropped, and a
  live round-trip check
- The document's full element vocabulary, derived by walking the tree
- CI green on every commit

Not yet complete:

- **Semantic call-flow view.** The tree view is generic by design. A read-only
  view that walks the script the way an operator does — page by page, greeting
  to close — would layer on top of the same parsed tree. Not built yet.
- **Upload / search.** The app reads the bundled fixture only.
- **Error presentation in the UI.** Parsing rejects malformed input with a clear
  `XmlParseError`, and `safeParseXml` returns a typed result for callers that
  must render a failure rather than throw. Wiring that into the interface is
  still to do.
- **XML declaration.** `parseXml` returns the document element, so the leading
  `<?xml version="1.0" encoding="utf-8"?>` is not part of the tree. The `pi` node
  kind exists to hold it; wiring it up is a small change.

See [DECISIONS.md](DECISIONS.md) for the reasoning behind these, including what
was deliberately left out.
