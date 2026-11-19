---
'@tanstack/solid-router': patch
---

perf(solid-router): make `useLinkProps` proxy-free in the spread hot path

`useLinkProps` previously layered four proxies (`merge` for defaults, two
`splitProps`/`omit` proxies, and a final `merge` of spreadable props with the
resolved props memo). Solid's `spread()` re-enumerated all of them through V8
proxy traps on every navigation, for every `Link`, which showed up in CodSpeed
profiles as a large unattributed "NodeJS internals" cost.

`useLinkProps` now returns a plain object with a stable key set whose
reactivity lives in property getters backed by fine-grained memos. Values that
no longer apply resolve to `undefined`, which `spread()` treats as attribute
removal. The built-location memo also gained href-based equality so downstream
memos skip work when a navigation doesn't change a link's target.

This makes the client-side navigation benchmark ~30% faster.

Note: keys returned by `activeProps`/`inactiveProps` functions are discovered
once at setup — functions that later return brand-new keys (beyond the initial
set plus `class`/`style`) won't have those keys applied.
