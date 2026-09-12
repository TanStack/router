---
'@tanstack/router-core': patch
---

`buildLocation` no longer structurally shares the built `search` and `state` with the current location. The observable `location.search` and `location.state` still preserve equal nested references across navigations, because `parseLocation` stabilizes them once a location is committed. A search whose contents equal the current search but list its keys in a different order now serializes in the requested order, so navigating to it creates a new history entry instead of being treated as the same location. A `state` object passed to `navigate` or `buildLocation` is never mutated.
