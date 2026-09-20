---
'@tanstack/router-core': patch
---

Advance the pending boundary past matches that have already settled.

The router offers a match outside the retained prefix as the pending boundary before it settles, even when the route has no `loader`. It also treated any presented match with status `pending` as the painted boundary, and every match below the boundary carries that status in the offered snapshot. A settled ancestor therefore kept selecting itself as the boundary and then stopped early on its own session, so the presented snapshot stayed `pending` until the slowest loader in the branch resolved.

The painted boundary is now the first presented `pending` entry, and a settled match hands over toward pending descendants. A layout route with no loader, such as one that is only lazy, now renders as soon as it settles, and the fallback stays on the match that is still loading. A terminal settled match that is still painted is still offered, so data-only routes keep their pending phase while hydrating on the client.
