---
'@tanstack/router-core': patch
---

Keep same-ID loader work, including pending background reloads, available to a navigation until it decides whether to reuse it, so a stale-while-revalidate result is no longer discarded when the revealed route navigates again from an effect
