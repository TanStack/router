---
'@tanstack/router-core': patch
---

fix(router-core): apply the `trailingSlash` option to the rewritten basepath `publicHref` before the SSR redirect comparison.

Fixes [#7291](https://github.com/TanStack/router/issues/7291): requesting a bare basepath URL (for example `/preview` with `basepath: '/preview'`) on the server always answered with a `308` redirect to `/preview/`, even with `trailingSlash: 'never'` (the default). `rewriteBasepath.output` joins the basepath and the internal pathname, which yields a trailing slash for the root route, and `buildLocation` never reconciled that with `trailingSlash` before comparing it to the incoming request URL. The rewritten pathname is now trimmed under `'never'`, given a trailing slash under `'always'` and left as is under `'preserve'`. This also applies to custom `rewrite.output` implementations: under `'never'` a trailing slash they emit is trimmed from `publicHref`.
