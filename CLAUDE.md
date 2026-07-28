# CLAUDE.md

See **[AGENTS.md](AGENTS.md)** — it is the single source of agent guidance for
this repo, kept in one file so the two conventions cannot drift apart.

The short version, if you read nothing else:

- **The parser must never know a tag name.** `src/parser/parseXml.ts` branches
  only on `node.nodeType`. Domain knowledge belongs in `src/script/selectors.ts`.
- **Never modify `src/fixtures/sample-script.xml`.** It is supplied input and
  must stay byte-identical. Test variations by `String.replace`-ing a copy.
- Before proposing a change: `npm run lint && npm run typecheck && npm test`.
  If you touched the parser or fixture, also `npm run export:json` and commit
  the regenerated artifact.
