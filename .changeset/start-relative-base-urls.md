---
'@tanstack/start-plugin-core': patch
---

fix(start-plugin-core): keep a relative Vite `base` (`'.'` / `'./'`) relative. `normalizePublicBase` no longer rewrites it to an absolute `/./`, so manifest asset paths stay relative and apps served from a relative base (for example embedded in an iframe or under an origin that is only known at request time) load their assets. `deriveRouterBasepath` treats a relative public base like an absolute URL base and falls back to `/` instead of deriving a router basepath of `.`.
