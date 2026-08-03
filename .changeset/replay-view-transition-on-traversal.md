---
'@tanstack/router-core': patch
---

feat: add `replayViewTransitionOnTraversal` router option

Replays the view transition a navigation opted into (`<Link viewTransition>` / `navigate({ viewTransition })`) when the user later traverses that entry with the browser Back/Forward buttons. Without it, those per-navigation opt-ins are not replayed on traversal (Back/Forward fall back to `defaultViewTransition`, if set, or no transition). Replay is symmetric (`A→B` plays on both back and forward). Opt-in, kept in-memory so a functional `types` survives, and does not affect `defaultViewTransition`.
