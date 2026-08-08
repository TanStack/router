---
'@tanstack/react-router': patch
'@tanstack/start-plugin-core': patch
---

feat(start): support serving assets via a relative base url. When the configured base path is relative (`./`), manifest asset paths and injected `<script>` `src` values are kept relative instead of being rewritten to absolute URLs, so apps served from a relative base (e.g. embedded in an iframe or under an unknown origin) load their assets correctly.
