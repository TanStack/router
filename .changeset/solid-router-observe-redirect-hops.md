---
'@tanstack/solid-router': patch
---

Observe tier (Solid's dev and observe builds only): a navigation sent elsewhere while it is pending — a `beforeLoad` or loader redirecting it, or another navigation requested before it published — is one record with its hops, as `@solidjs/router` declares one: the record keeps the first request's time and interaction, names the destination that showed, and lists the destinations it abandoned in `redirects` (each with its name, `to`, params, and when it was sent on). The router declares a `redirect: n` ref per hop around the publish that lands. The browser moving (back, forward) while a navigation is pending supersedes it instead: a record of its own, from the location shown. Before, the record named only the final destination and kept no hops. Nothing changes in production, where `OBSERVE` is undefined.
