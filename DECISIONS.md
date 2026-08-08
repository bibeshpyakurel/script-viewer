# Design decisions

Every significant choice, why it was made, and what was rejected. Written so
another developer can extend this without reverse-engineering the reasoning.

---

## 1. One uniform node type, not a domain model

**Decision.** A single `XmlNode` type represents any XML node. There is no
`PageNode`, `ModeNode`, or `InputElement` type.

**Why.** The project's core guarantee forbids an allowlist: a new element or
attribute must be retained without changing the parser. A domain model is an
allowlist wearing a different hat — the moment you write
`interface Page { pageId: string }`, an export containing
`<Page vendorFlag="x">` starts losing data at the type
boundary. Keeping structure as _data_ rather than _type-level knowledge_ means
the parser has nothing to be surprised by.

**Rejected: typed domain model.** Nicer autocomplete for known fields, and
tempting because the fixture's vocabulary looks stable. Rejected because it
fails the core requirement above, and because the sample export itself contains
`<FutureVendorSetting>` with `<UnknownValue>retain-in-json</UnknownValue>` — a
deliberate signal that unknown fields are expected.

**Rejected: `Record<string, unknown>`.** Loses all structure and gives no
guarantees at all.

**Cost.** Consumers must walk a generic tree rather than dot into typed fields.
The fix is small typed _selectors_ over the generic tree — a lookup layer for the
UI — never a typed parse result. That layer now exists; see §14.

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

**Why.** This is where "no allowlist" is enforced, and it is checkable. Every
string literal in `parseXml.ts` is one of: two import paths, the six `kind`
tags, the three xmldom severity levels (`warning`, `error`, `fatalError`), one
MIME type, this project's own error name, one error message, and two formatting
strings. **No XML tag or attribute name appears anywhere in the file** — grep it
against the fixture's vocabulary and nothing matches.

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

**Verified behavior on malformed input.** xmldom throws only on _fatal_ errors.
Several genuinely malformed documents are reported to `onError` and then
**recovered**, handing back a tree that misrepresents the source:

| Input              | xmldom                      |
| ------------------ | --------------------------- |
| `<a><b></a>`       | throws (fatal)              |
| `<a x="1" x="2"/>` | throws (fatal)              |
| `<a>&nope;</a>`    | reports `error`, recovers   |
| `<a x=1/>`         | reports `warning`, recovers |
| `junk<a/>`         | reports `error`, recovers   |

The recovering cases are the dangerous ones — nothing looks wrong. Capturing
`onError` is therefore a **correctness** requirement, not a message-quality
nicety. `parseXml` collects every report and rejects the document if there are
any. The sample fixture reports zero, so this is strict without being noisy.

**Known limitation.** A bare ampersand (`<a>x & y</a>`) produces no report at
all and parses to the text `x & y`. xmldom tolerates it silently, so this parser
accepts it too. No data is lost, but technically invalid XML gets through.

## 9. A `pi` kind for processing instructions

**Decision.** `XmlNode` includes a kind carrying `target` and `data`.

**Why.** The fixture opens with `<?xml version="1.0" encoding="utf-8"?>`.
Without somewhere to put it, a full-document round trip would silently drop the
first line of the sample file.

**Honest caveat.** Strictly, the XML spec treats the declaration as its own
production and forbids `xml` as a PI target, so reusing this kind for it is a
deliberate simplification — the two are syntactically identical and it keeps the
union at six kinds instead of seven.

## 9a. A `document` kind, so the prolog survives

**Decision.** `parseXml` returns the **document**, not the document element.

**Why.** A document is not the same thing as its root element. The XML
declaration, any comment or PI before `<ScriptExport>`, and the whitespace
between them are children of the document and siblings of the root. Returning
`doc.documentElement` — which this project did until recently — silently
discarded the sample file's first line, which is precisely the loss the rest of
the design exists to prevent.

**Cost, stated plainly.** This changed the return type for every caller. Test
helpers that walked from an element root, the fidelity walkers in `analyze.ts`,
and the renderer all needed to handle one more kind. That cost is why it was
deferred once; it is not a reason to leave a known gap in the core guarantee.

**Rejected: reconstructing the declaration from the source string.** A regex over
the input would have avoided touching the return type. Rejected because it
invents a second, parallel parse path for one special case — and xmldom already
exposes the declaration as an ordinary PI node, so the honest fix was cheaper
than the workaround.

**Note on the empty-document case.** A prolog alone is not a document. `parseXml`
still requires a root element and rejects input without one, so an input
consisting only of `<?xml version="1.0"?>` fails rather than parsing to nothing.

## 10. TypeScript end to end

**Decision.** TypeScript everywhere — parser, serializer, components, tests —
with `strict` on.

**Why.** The whole project rests on one claim: nothing is lost between XML and
screen. That claim lives in a type. `XmlNode` being a discriminated union means
a `switch` over `kind` is checked for exhaustiveness, so adding a seventh node
kind breaks the build at every place that fails to handle it — the compiler
enforces the guarantee instead of a human having to notice. `strict` and
`noUncheckedIndexedAccess` matter most in the parser and tests, where array
indexing is constant; they caught real gaps while this was being written.

The payoff shows up in the renderer too: because `XmlNode` is a closed union,
the view cannot forget a node kind. That is the display-side half of "nothing
gets silently dropped," and it costs nothing at runtime.

**Rejected: JavaScript with JSDoc.** Lighter toolchain, no build step for
types. Rejected because the exhaustiveness checking above is the point, and it
is much weaker without real types.

**Rejected: TypeScript only in the parser.** The boundary would sit exactly
where data crosses into the UI — the place a lossy shortcut is most likely to
be introduced, and the place a reader is most likely to look.

## 11. TypeScript pinned to `~6.0.3`

**Decision.** Not the latest 7.x.

**Why.** `typescript-eslint` declares a peer range of `<6.1.0`. TypeScript 7
hard-fails `npm install` with `ERESOLVE`. Pinning the newest version the linter
genuinely supports is preferable to forcing the install with
`--legacy-peer-deps` and hoping. Revisit when typescript-eslint ships TS 7
support.

## 12. Strict everything

**Decision.** `strict: true`, plus `noUncheckedIndexedAccess`,
`noUnusedLocals`, `noUnusedParameters`.

**Why.** `noUncheckedIndexedAccess` matters most here: parser code indexes into
arrays constantly, and it forces every access to be treated as possibly
undefined. It caught real gaps while writing the tests.

## 13. CI ordered cheapest-first

**Decision.** `npm ci → lint → typecheck → test → build` on Node 20.

**Why.** Fail fast on the cheapest signal. `npm ci` rather than `npm install` so
a drifted lockfile fails the build instead of being silently reconciled.

## 14. Selectors, and why they are not an allowlist

**Decision.** `src/script/selectors.ts` is the one file that knows the format's
vocabulary. The Script view reads through it. The parser still knows nothing.

**Why this is safe.** §1 rejects a typed domain model because it becomes an
allowlist at the type boundary. A selector layer avoids that for three reasons,
and all three have to hold:

1. **It runs after parsing.** The tree is complete before any selector is
   called. Nothing in this file can affect what was preserved.
2. **It is never the only path to a value.** Everything a selector surfaces is
   still in the JSON tab, the Tree tab, and the exported artifact.
3. **It cannot drop a field, on either axis.** `partition()` splits an
   element's children into the names a view handles and a `rest` array;
   `unknownAttributes()` does the same for its attributes. Every view renders
   both through `UnrecognizedFields`.

Point 3 is the load-bearing one. A conventional domain-aware UI fails by showing
only what it was taught about; here, an unfamiliar element loses its styling and
nothing else. Tests assert that `recognized + rest` accounts for every child and
every attribute, so there is no third outcome for a field to disappear into.

**The attribute half was missing at first, and it cost me a field.** The
original partition covered child elements only, so three values that exist
solely as attributes — `scriptId`, `versionId`, `actionId` — reached the JSON
and the Tree tab but never the Script tab, and nothing flagged them. Worse,
`<XmlVersion>` was listed in `PAGE_KNOWN` but never rendered, so being
_recognized_ is what made it vanish: it was excluded from `rest` and then
drawn by nobody. That is the exact failure this design claims to prevent,
reintroduced one level down.

The fix generalizes rather than patching three names: attributes are now
partitioned like children, and a test injects an attribute that appears nowhere
in the fixture and asserts it reaches the screen. The lesson is written into
`AGENTS.md` — naming a field in a `*_KNOWN` list is a promise to render it.

**Reading blocks generically.** `<Requirements>` and `<XmlDisplayNode>` are read
as whatever simple leaves they contain, not as four known fields. That is why
`<SaveFormatted>`, which appears on exactly one element in the fixture, needed no
special case, and why a requirement type invented next year will render fine.

**Rejected: rendering the semantic view straight from the tree in JSX.** Fewer
files, but the vocabulary would be smeared across components and the
"everything is accounted for" property would have nowhere to live or be tested.

**Rejected: a `toDomainModel()` transform returning typed structs.** This is §1's
rejected design wearing a later timestamp. The moment the UI reads only from
typed structs, whatever the transform failed to copy is invisible.

**Cost.** Two ways to read the same data, which must not disagree. They cannot
drift far, because the selectors return nodes from the same tree rather than
copies — but a reader does have to understand which layer they are in.

## 15. Making the failure path reachable

**Decision.** Ship a "Load a broken file" button alongside file upload.

**Why.** Rejecting malformed XML is one of the most carefully built parts of this
project — see §8 on the documents xmldom silently recovers from. With only a
valid fixture bundled, none of it was observable without editing code. Behavior
nobody can see is behavior nobody can review.

**Why an undefined entity, specifically.** An unclosed tag is fatal in xmldom and
throws; any parser catches that. An undefined entity is _recovered_ — xmldom
hands back a tree that misrepresents the file. That quiet case is the one worth
demonstrating, because it is the one a naive implementation gets wrong.

**Guarded against rot.** The broken sample is produced by `String.replace` on a
copy of the fixture. If that anchor stopped matching, the button would load
perfectly valid XML and the demo would prove nothing while still appearing to
work. A test asserts the result actually fails to parse, and that the fixture
itself is untouched.

## 16. A committed JSON artifact, checked in CI

**Decision.** `npm run export:json` writes `parsed/sample-script.json`, the file
is committed, and CI verifies it is current.

**Why.** The parser's output should be inspectable without ceremony. The JSON
tab satisfies that only for someone willing to run the app; a committed file can
be opened on GitHub, diffed, or piped into `jq`.

**Why check it in CI.** A committed generated file is normally a liability — it
drifts from the code that produced it and nobody notices. Regenerating and
comparing in CI turns it into an asset: it cannot be stale, and the diff on a
parser change shows exactly what the change did to the output.

**Cost.** Touching the parser means regenerating and committing the artifact, or
CI fails. That is the intended trade: a small, loud chore instead of a silent
inconsistency.

---

## What I deliberately left out

**This is a viewer, not an editor.** That is the single scoping decision behind
most of what follows. Reading a script export is a bounded problem with a
verifiable correctness property — nothing is lost. Editing is a different
product: it needs a mutation model, undo, validation on write, conflict
handling, and a way to emit XML the originating platform will accept. Adding a
shallow version of that would have traded a guarantee I can prove for a feature
I could not stand behind.

Also left out, each on purpose:

- **No editing.** Upload has since been added — the parser already took a
  string, so it was a file input and an error path. Editing is still out, for
  the reason above.
- **No search.** Still out, and now the most obvious next gap: three pages are
  scannable, dozens would not be.
- **No state management library.** Nothing needs shared mutable state. Node
  expansion, the active tab, and the loaded source are local component state.
  The cost is that a view cannot be shared as a URL; deep linking would be the
  reason to revisit this, not state complexity.
- **No CSS framework or component library.** ~1,200 lines of plain CSS covers
  it, and a framework would have been more configuration than styling.
- **No schema validation.** Validating against a schema means declaring which
  elements are legal — an allowlist through the back door, and the fixture is
  explicit that unknown fields must survive.
- **No byte-level round trip.** Structural equality is the useful guarantee.
  Byte equality would force the serializer to reproduce incidental formatting
  and would prove things about the serializer, not the data model.
- **No performance work.** The fixture is 13.5 KB. The walk is recursive and
  rendering is eager, so a very large or deeply nested export would strain both.
  I would rather measure against a real file than guess at a shape I have not
  seen.

## What I would build next

Done since the first pass: the XML declaration is captured (§9a), the semantic
call-flow view exists as selectors over the tree (§14), file upload ships with a
reachable failure path (§15), and the JSON is a committed, CI-checked artifact
(§16).

Remaining, in priority order:

1. **Search and filter.** Find a field by name, tag, or id across pages. With
   three pages the flow is scannable; a real export with dozens would not be.
   This is the first thing I would build next.
2. **Deep linking.** Tab, page, and loaded source are component state, so a view
   cannot be shared as a URL. Moving them to the query string is small and makes
   review much easier — "look at this element" becomes a link.
3. **Property-based testing.** Generate random XML, assert the round trip holds.
   The two gaps I found by hand-writing mutations — whitespace loss and element
   namespace prefixes — are exactly what generative testing finds automatically.
4. **Accessibility pass.** Keyboard navigation and screen-reader testing. It is
   keyboard-operable and labelled today, but not audited, and the tree is not a
   true `role="tree"` widget.
5. **Virtualized rendering.** Rendering is eager and the walk is recursive; a
   very large or deeply nested export would strain both. I would measure against
   a real file first rather than optimize for a shape I have not seen.

### Known limits worth knowing

- The serializer does not guard against a `]]>` sequence inside CDATA or `--`
  inside a comment. Neither occurs in the fixture, and both would need escaping
  strategies that change the round-trip contract.
- A bare ampersand (`<a>x & y</a>`) is accepted, because xmldom reports nothing
  for it (§8). No data is lost, but technically invalid XML gets through.
