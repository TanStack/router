---
'@tanstack/solid-router': patch
---

Solid Links of one route share a single location signal, so the Links of a departing route do no reactive work while it unmounts.
