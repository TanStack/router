---
'@tanstack/router-core': patch
---

feat: add `replayViewTransitionOnTraversal` router option

Replays the view transition a navigation opted into (`<Link viewTransition>` / `navigate({ viewTransition })`) when the user later traverses that entry with the browser Back/Forward buttons, instead of a hard cut. Replay is symmetric (`A→B` plays on both back and forward). Opt-in, kept in-memory so a functional `types` survives, and does not affect `defaultViewTransition`.
