---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
---

feat: history-aware links via a `preferBack` prop on `Link`

`<Link to="/x" preferBack>` now navigates via `history.back()` when `/x` resolves to the previous history entry, instead of always pushing a new one. This preserves forward history and the browser's native per-entry scroll restoration for "Back to X" links. It is best-effort: when the target isn't the previous entry — or the previous entry is unknown (e.g. a fresh page load or deep link) — it falls back to a normal push (or `replace`, if set). The element always renders a real `<a href>`, so keyboard nav, "copy link", and middle/modifier-click keep working.

`preferBack` accepts a match mode: `true`/`'pathname'` (default) matches by pathname only (restoring the previous entry's exact search and scroll), while `'exact'` also requires the search to match.

New public APIs:

- `useIsBackNavigation(options, match?)` (react-router) — the primitive behind `preferBack`; returns whether navigating to `options` would resolve to the previous history entry. `match` is `'pathname'` (default) or `'exact'`.
- `router.getHistoryEntry(index)` (router-core) — read a visited history entry by its `__TSR_index` from the router's in-memory per-index tracking.
