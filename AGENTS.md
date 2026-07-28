# AGENTS.md

Orientation for AI coding agents (and humans in a hurry) working in this repo.
`README.md` explains what the project does; this explains how to change it
without breaking the one property it exists to guarantee.

## What this project is

A viewer for AnSer call-center script exports. It parses XML into JSON and
renders it three ways: a **Script** view organized the way a reviewer reads a
script, a **Tree** view showing every node exactly as parsed, and a **JSON**
view of the raw parsed tree.

## The one rule

**The parser must never know a tag name.**

`src/parser/parseXml.ts` branches only on `node.nodeType` — a closed set fixed by
the XML spec. No XML tag or attribute name appears anywhere in that file, and
none may be added. An export containing an element nobody has seen must survive
with its name, attributes, text, parent, and sibling position intact, with no
code change.

This is the project's core requirement, not a stylistic preference. If a task
seems to need the parser to recognize a name, it is the wrong layer — use
`src/script/selectors.ts` instead (see below).

Practical consequences, each with a test that will fail if you break it:

- `attributes` and `children` are **ordered arrays**, never objects keyed by
  name. Objects lose order, collapse duplicates, and mishandle namespaces.
- Whitespace-only text nodes are **kept** by the parser and filtered at render
  time. Dropping them at parse time is irreversible.
- Empty elements are real nodes with `children: []`, never `null` or omitted.
- Element and attribute names keep their namespace prefix (`xsi:type`, not
  `type`). Elements use `tagName`, never `localName`.
- `parseXml` returns the **document**, not the root element, so the XML
  declaration and anything else in the prolog survives.
- Malformed XML is **rejected, never half-parsed**. xmldom silently _recovers_
  from several broken documents; `parseXml` captures its error handler and
  refuses anything that reports a problem. Do not relax this.

## Layout

```
src/
  types/xmlNode.ts       The uniform node type. READ THIS FIRST.
  parser/
    parseXml.ts          String -> tree. Vocabulary-free. The rule above lives here.
    serializeXml.ts      Tree -> string. Exists to make fidelity provable.
    analyze.ts           Fidelity measurement and element vocabulary.
  script/selectors.ts    Read-only lookup layer. The ONLY place that knows AnSer names.
  components/            React UI.
    App.tsx              Source + tab state, error path, layout.
    ScriptView.tsx       Semantic view: overview, call flow, pages.
    ScriptElementCard.tsx  One script element.
    XmlNodeView.tsx      Generic recursive tree renderer. Knows no tag names.
    UnrecognizedFields.tsx  Fallback for anything the semantic view cannot style.
    SourcePicker.tsx     File upload + the deliberately broken sample.
  fixtures/              The supplied export, byte-for-byte unchanged. READ-ONLY.
scripts/export-json.ts   CLI: XML -> JSON file. `--check` guards the committed artifact.
parsed/                  Generated JSON artifact. Do not hand-edit.
```

## Where to put a change

| You want to…                             | Change                                    |
| ---------------------------------------- | ----------------------------------------- |
| Support a new XML construct (entity, PI) | `parser/parseXml.ts` + `types/xmlNode.ts` |
| Show a known field more nicely           | `script/selectors.ts` + a component       |
| Change how unknown fields appear         | `components/UnrecognizedFields.tsx`       |
| Add a new view of the same data          | New component, read from selectors        |
| Change what counts as a parse failure    | `parser/parseXml.ts`                      |

### Selectors vs. the parser

`src/script/selectors.ts` is the one file that knows AnSer's vocabulary. That is
allowed because it is a **read-only lookup layer**, not a parse step:

- It runs after parsing; the tree is already complete.
- It is never the only path to a value — everything is still in the JSON and the
  Tree view.
- It **cannot drop a field**. Each selector splits children with `partition()`
  into ones it names and a `rest` array, and every view renders `rest` through
  `UnrecognizedFields`. Unrecognized is a _rendering mode_, not a filter.

When adding a field to a `*_KNOWN` list, understand what you are doing: you are
upgrading its presentation, not making it visible. It was already visible.

## Commands

```bash
npm ci                    # install exactly what the lockfile pins
npm run dev               # dev server
npm test                  # 96 tests, ~300ms
npm run lint              # ESLint
npm run typecheck         # tsc --noEmit
npm run format            # Prettier write
npm run build             # production build to dist/
npm run export:json       # regenerate parsed/sample-script.json
npm run export:json:check # verify that artifact is current (CI runs this)
```

Requires Node 20.19+ (or 22.12+). CI runs Node 20 and executes:
`npm ci → lint → typecheck → test → export:json:check → build`.

Run `npm run lint && npm run typecheck && npm test` before proposing a change.
If you touched the parser or the fixture, also run `npm run export:json` and
commit the regenerated artifact, or CI will fail on the drift check.

## Things that will waste your time if you don't know them

- **Never modify `src/fixtures/sample-script.xml`.** It is the supplied input and
  must stay byte-identical. It is listed in `.prettierignore` for that reason. To
  test a variation, `String.replace` a copy in the test — that is what the
  existing tests do.
- **`?raw` imports** are a Vite feature. In `scripts/`, read the file with
  `node:fs` instead.
- **Tests run in `environment: 'node'`**, not jsdom. Component tests use
  `renderToStaticMarkup` and assert on the HTML string. There is no DOM, so no
  clicking; test behavior through props and rendered output.
- **The round-trip test cannot catch whitespace loss.** If the parser dropped
  whitespace, serialize and re-parse would drop it consistently and the trees
  would still match. Dedicated tests pin that separately — don't assume the round
  trip covers everything.
- **TypeScript is pinned to `~6.0.3`** because `typescript-eslint` declares a
  peer range of `<6.1.0`. Do not bump to 7 until that changes; it hard-fails
  `npm install`.
- `noUncheckedIndexedAccess` is on. Array access is `T | undefined`; handle it
  rather than asserting with `!`.

## Testing expectations

Tests here assert **properties**, not line coverage. Two patterns matter most:

1. **Anti-rot assertions.** Tests that inject a "new" element also assert the
   name is absent from the fixture, so the test cannot decay into a no-op.
2. **Measured, not asserted.** The "0 nodes dropped" figure is computed by
   serializing, re-parsing, and comparing — not printed as a constant.

Any change touching the parser or selectors should come with a test that would
fail if the no-allowlist guarantee were broken.

## Further reading

- `README.md` — what it does, how to run it, current status.
- `DECISIONS.md` — every significant choice, what was rejected, and why. Read
  this before proposing an architectural change; the obvious alternatives were
  considered and the reasoning is recorded.
