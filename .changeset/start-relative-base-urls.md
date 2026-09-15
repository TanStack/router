---
'@tanstack/start-plugin-core': patch
---

fix(start-plugin-core): preserve relative base paths (`'.'` / `'./'`) in `normalizePublicBase` instead of normalizing them to an absolute `/.`, so manifest asset paths stay relative and apps served from a relative base (e.g. embedded in an iframe or under an unknown origin) load their assets correctly.
