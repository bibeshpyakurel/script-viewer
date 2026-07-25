# Script Viewer

Parses an AnSer call-center script export (XML) into a lossless JSON tree, and
renders it as a readable script view.

The core idea: **one uniform node type represents any XML node**, so the parser
has no knowledge of AnSer's vocabulary. An element it has never seen survives
with its name, attributes, parent, and sibling position intact — with no code
change. That property is enforced by tests, not asserted in prose.

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

15 tests, all against the real supplied fixture. They prove the properties the
project depends on rather than just exercising the code:

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

See [DECISIONS.md](DECISIONS.md) for why each choice was made.

## Project structure

```
src/
  parser/
    parseXml.ts         XML string -> XmlNode tree. Generic; no tag names appear.
    serializeXml.ts     XmlNode tree -> XML string. Exists to prove fidelity.
    parseXml.test.ts    The fidelity suite.
  types/
    xmlNode.ts          The one node type. Read this first.
  fixtures/
    sample-script.xml   The supplied export, byte-for-byte unchanged.
  components/           UI.
  main.tsx              React entry point.
```

**Read `src/types/xmlNode.ts` first.** It is the contract the rest of the
project is built around, and its doc comment explains the reasoning.

The fixture is treated as read-only input. It is listed in `.prettierignore` so
formatting can never rewrite it, and it is loaded via Vite's `?raw` import as an
immutable string.

## How it works

1. `parseXml(xml)` hands the string to `@xmldom/xmldom`'s `DOMParser`.
2. It walks the DOM recursively, converting each node to an `XmlNode`.
3. The only branch is a `switch` on `node.nodeType` — a fixed, spec-defined set
   of structural kinds. **No branch anywhere compares a tag or attribute name.**
4. Names and values are copied as opaque strings; children are mapped in order.

`XmlNode` is a discriminated union over five kinds — `element`, `text`, `cdata`,
`comment`, `pi`. Elements hold their name exactly as written (namespace prefix
included), attributes as an **ordered array** of `{ name, value }`, and children
as an **ordered array**. Both are arrays rather than objects because sibling
order carries meaning and an object would lose order, collapse duplicates, and
handle namespace declarations poorly.

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
- CI green on every commit

Not yet complete:

- **Frontend.** The script rendering UI is still in progress.
- **JSON inspection.** No route or export yet for viewing the parsed JSON.
- **Error presentation.** Malformed XML throws (verified — it does not silently
  produce a partial tree), but the errors are raw `@xmldom/xmldom` `ParseError`s
  and are not yet wrapped or surfaced in the UI.
- **XML declaration.** `parseXml` returns the document element, so the leading
  `<?xml version="1.0" encoding="utf-8"?>` is not part of the tree. The `pi` node
  kind exists to hold it; wiring it up is a small change.

See [DECISIONS.md](DECISIONS.md) for the reasoning behind these, including what
was deliberately left out.
