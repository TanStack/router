---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a navigation that passes a `useBlocker` keeps the interaction that requested it and is dated from the request, though the history awaits the blocker before it changes; one the blocker holds until `proceed()` joins the interaction that proceeds and is dated from it, as `@solidjs/router`'s `retry()` makes it. The router notes the request at `commitLocation` for the history change to take. A navigation the blocker stops, or a request that changes no history (the same location reloading), leaves nothing noted behind. Nothing changes in production, where `OBSERVE` is undefined.
