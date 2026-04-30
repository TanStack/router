---
'@tanstack/router-core': minor
'@tanstack/react-router': minor
'@tanstack/solid-router': minor
'@tanstack/vue-router': minor
---

Allow `params.parse` to experimentally return `false` to skip an incoming route candidate during path matching. Thrown parse errors still surface on the selected match instead of falling through, and outgoing typed route-template links continue to use exact route lookup followed by `params.stringify` for URL generation.
