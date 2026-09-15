# Changelog

Notable changes to Script Viewer. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow [Semantic Versioning](https://semver.org/).

Entries from v0.1.0 onward are generated from Conventional Commits by
`scripts/build-release-notes.sh` and published as GitHub Releases.

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-09-15

First tagged release.

### Added

- XML parsing onto a single uniform node type, so the parser holds no knowledge
  of the call-centre script vocabulary and an unseen element survives with its
  name, attributes, parent and sibling position intact
- Three views over the same tree: Script (the call, page by page), Tree (every
  node exactly as parsed), and JSON (the raw parser output)
- Unrecognised elements rendered in full under a badge rather than skipped, so a
  domain-aware UI cannot hide a field
- File upload, theme toggle, and a JSON artifact export that CI re-derives and
  compares, so it cannot drift from the parser that produced it

### Infrastructure

- CI runs lint, `format:check`, typecheck, tests with coverage thresholds, the
  JSON artifact check, and the build
- `format:check` runs in CI for the first time — the script existed but was
  never called
- Coverage thresholds added as a ratchet (statements 68, branches 62,
  functions 70, lines 70), just under the measured values
- Conventional commits enforced on pull requests; releases generated from them
- `main` protected, CodeQL and Dependabot enabled, actions pinned to SHAs

[Unreleased]: https://github.com/bibeshpyakurel/script-viewer/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/bibeshpyakurel/script-viewer/releases/tag/v0.1.0
