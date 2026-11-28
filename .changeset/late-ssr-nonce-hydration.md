---
'@tanstack/router-core': patch
---

Read `router.options.ssr.nonce` when the hydration scripts are built, so a nonce set after the router is created reaches the hydration `<script>` tags.
