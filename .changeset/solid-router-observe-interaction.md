---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a navigation's record joins the interaction that requested it — the `<Link>` click, or any handler that called `navigate()` — though the match publish it wraps runs after the loaders, long after the handler returned. The Transitioner captures `OBSERVE.attribution.currentOrigin()` with the request time when the history changes and hands it back as `NavigationRef.interaction` (solid-js 2.0.0-rc.12), so the record, and every hold and re-run the publish causes, carries the click. A navigation requested outside any interaction declares none. Nothing changes in production, where `OBSERVE` is undefined.
