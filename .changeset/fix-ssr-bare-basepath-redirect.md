---
'@tanstack/router-core': patch
---

fix(router): apply trailingSlash config to the rewritten basepath URL before the SSR redirect comparison.

Fixes [#7291](https://github.com/TanStack/router/issues/7291): visiting a bare basepath URL (e.g. `/preview`) on the server always triggered a spurious `308` redirect to `/preview/` even when `trailingSlash` was `'never'` (the default), because the rewritten public href was synthesised from `URL` parsing — which always normalises to a trailing slash — and never reconciled with the user's `trailingSlash` config before being compared to the incoming request URL.
