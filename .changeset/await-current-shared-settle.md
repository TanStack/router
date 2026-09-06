---
'@tanstack/router-core': patch
---

Make each load transaction's completion follow its current successor so a burst of back-to-back loads wakes each superseded waiter once instead of once per successor. Previously every superseded `load()` re-polled the current transaction on each later completion, which was quadratic in microtask work.
