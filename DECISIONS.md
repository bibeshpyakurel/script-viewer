# Design decisions

Every significant choice, why it was made, and what was rejected. Written so
another developer can extend this without reverse-engineering the reasoning.

---

## 1. One uniform node type, not a domain model

**Decision.** A single `XmlNode` type represents any XML node. There is no
`PageNode`, `ModeNode`, or `InputElement` type.

**Why.** The brief forbids an allowlist: a new element or attribute must be
retained without changing the parser. A domain model is an allowlist wearing a
different hat — the moment you write `interface Page { pageId: string }`, an
export containing `<Page vendorFlag="x">` starts losing data at the type
boundary. Keeping structure as _data_ rather than _type-level knowledge_ means
the parser has nothing to be surprised by.

**Rejected: typed domain model.** Nicer autocomplete for known fields, and
tempting because the fixture's vocabulary looks stable. Rejected because it
fails the brief's core requirement and because AnSer's own fixture contains
`<FutureVendorSetting>` with `<UnknownValue>retain-in-json</UnknownValue>` — a
deliberate signal that unknown fields are expected.

**Rejected: `Record<string, unknown>`.** Loses all structure and gives no
guarantees at all.

**Cost.** Consumers must walk a generic tree rather than dot into typed fields.
The intended fix is small typed _selectors_ over the generic tree — a lookup
layer for the UI — never a typed parse result.

## 2. `attributes` is an ordered array, not an object

**Decision.** `attributes: { name: string; value: string }[]`.

**Why.** An object keyed by attribute name loses three things:

- **Order.** Round-tripping should not silently reshuffle attributes.
- **Duplicates.** An object collapses repeated names to the last value. A parser
  that should _report_ malformed input cannot flag what it already discarded.
- **Namespaces.** `xmlns:xsi` and `xsi:type` are ordinary attributes here, kept
  verbatim with their prefix.

The fixture proves the namespace point concretely: it declares `xmlns:xsd` on
the root and **never uses it**. A parser that recorded only namespaces it saw in
use would drop that declaration entirely and fail "preserve every namespace."
There is a test for exactly this.

**Rejected: `Record<string, string>`.** Ergonomic for lookups, lossy for
everything above. Lookup ergonomics are recoverable with a helper; lost data is
not.

**Rejected: a separate `namespaces` map.** Would require resolving prefixes at
parse time — deciding what `xsi` means before anyone asked. Keeping raw pairs
defers that decision to whoever actually needs it.

## 3. `children` is an ordered array

**Decision.** `children: XmlNode[]`, always present, `[]` when empty.

**Why.** In XML, sibling order _is_ meaning. The three `<Option>` values
(`Routine`, `Urgent`, `Emergency`) are a dropdown an operator reads top to
bottom. The three `<Page>` elements are the call flow. Grouping children into
`{ Option: [...], Mode: [...] }` would collapse the interleaving between groups
and make document order unrecoverable.

**Rejected: keyed-by-tag-name map.** Convenient for `node.children.Page`, fatal
for order and for mixed content.

## 4. Empty elements are real nodes

**Decision.** `<XmlCalcNode />` parses to an element with `children: []` — never
`null`, `undefined`, or an omitted field.

**Why.** Absent children and zero children are the same thing in XML, and
callers should iterate without a presence check. The fixture has 14 self-closing
elements; treating them as nothing would delete real structure. Tested.

## 5. Whitespace-only text nodes are kept

**Decision.** Indentation between elements is preserved as `text` nodes.

**Why.** It is real character data. Dropping it at parse time is irreversible;
filtering it at render time is not. The lossless choice is the one that can be
undone.

**Cost, stated plainly.** The JSON is noisier, and the UI must skip whitespace
when rendering. That is a real tax paid deliberately.

**Why this needed its own test.** The round-trip check **cannot** catch
whitespace loss — if the parser dropped it, serialize and re-parse would drop it
consistently and the trees would still match. This was found by deliberately
breaking the parser and noticing all tests still passed. Two explicit tests now
pin the behavior.

## 6. `switch` on `nodeType`, never on a name

**Decision.** The parser's only branch is `switch (node.nodeType)`.

**Why.** This is where "no allowlist" is enforced, and it is checkable: every
string literal in `parseXml.ts` is two import paths, one error message, one MIME
type, and the five `kind` tags. **No XML tag or attribute name appears anywhere
in the file.**

**Note on the distinction.** Switching on `nodeType` is not an allowlist. An
allowlist restricts an open-ended vocabulary — tag names, of which there are
infinitely many. Node kinds are a closed set fixed by the XML spec, and
distinguishing them is what the type requires. The `default:` branch throws
rather than coercing an unmodelled kind into text, so a surprise fails loudly
instead of corrupting data quietly.

## 7. A serializer, purely as proof

**Decision.** `serializeXml.ts` exists to enable the round-trip test, not as a
user feature.

**Why.** Structural fidelity is otherwise a claim. `parse → serialize → parse`
producing a deeply equal tree demonstrates nothing structural was lost.

**Limits, stated honestly.** It proves _structural_, not _byte_, fidelity. The
output normalizes attribute quoting and self-closes empty elements, so it is not
byte-identical to the source. And as noted in §5, it is blind to any loss both
halves share. It is one instrument among several, not the whole proof.

## 8. `@xmldom/xmldom` for parsing

**Decision.** Use `@xmldom/xmldom` rather than the browser's built-in
`DOMParser` or a JS-object XML library.

**Why.** It behaves identically in Node and the browser, so the same parser runs
under Vitest (`environment: 'node'`) and in the app — no jsdom, no divergence
between what tests cover and what ships. It also exposes namespace declarations
as ordinary attributes, which is exactly what §2 needs.

**Rejected: browser `DOMParser`.** Free, but absent in a Node test environment
without pulling in jsdom, and it reports malformed XML by embedding a
`<parsererror>` element into the tree rather than failing.

**Rejected: `fast-xml-parser` / `xml2js`.** They produce plain JS objects keyed
by tag name, which loses sibling order and duplicate handling by construction —
the exact failure this design exists to avoid.

**Verified behavior on malformed input.** Five malformed documents (unclosed
tag, mismatched nesting, non-XML text, empty string, truncated mid-attribute)
all **throw**. There is no silent partial tree. What is still missing is wrapping
those raw `ParseError`s into something the UI can present clearly.

## 9. A `pi` kind for processing instructions

**Decision.** `XmlNode` includes a fifth kind carrying `target` and `data`.

**Why.** The fixture opens with `<?xml version="1.0" encoding="utf-8"?>`.
Without somewhere to put it, a full-document round trip would silently drop the
first line of the supplied file.

**Honest caveat.** Strictly, the XML spec treats the declaration as its own
production and forbids `xml` as a PI target, so reusing this kind for it is a
deliberate simplification — the two are syntactically identical and it keeps the
union at five kinds.

**Known gap.** `parseXml` currently returns the document _element_, so the
declaration sits above the root and is not yet captured. The type is ready; the
wiring is not.

## 10. TypeScript pinned to `~6.0.3`

**Decision.** Not the latest 7.x.

**Why.** `typescript-eslint` declares a peer range of `<6.1.0`. TypeScript 7
hard-fails `npm install` with `ERESOLVE`. Pinning the newest version the linter
genuinely supports is preferable to forcing the install with
`--legacy-peer-deps` and hoping. Revisit when typescript-eslint ships TS 7
support.

## 11. Strict everything

**Decision.** `strict: true`, plus `noUncheckedIndexedAccess`,
`noUnusedLocals`, `noUnusedParameters`.

**Why.** `noUncheckedIndexedAccess` matters most here: parser code indexes into
arrays constantly, and it forces every access to be treated as possibly
undefined. It caught real gaps while writing the tests.

## 12. CI ordered cheapest-first

**Decision.** `npm ci → lint → typecheck → test → build` on Node 20.

**Why.** Fail fast on the cheapest signal. `npm ci` rather than `npm install` so
a drifted lockfile fails the build instead of being silently reconciled.

---

## What was deliberately left out

- **No state management library.** Nothing yet needs shared mutable state.
- **No CSS framework.** Not enough UI to justify the dependency.
- **No schema validation.** Validating against a schema would reintroduce an
  allowlist through the back door.
- **No XML byte-level round trip.** Structural equality is the useful guarantee;
  byte equality would force the serializer to reproduce incidental formatting
  and would prove less about the data model.
