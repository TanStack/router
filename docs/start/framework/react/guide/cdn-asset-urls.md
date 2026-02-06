---
id: cdn-asset-urls
title: CDN Asset URLs
---

# CDN Asset URLs

> **Experimental:** `transformAssetUrls` is experimental and subject to change.

When deploying to production, you may want to serve your static assets (JavaScript, CSS) from a CDN. The `transformAssetUrls` option on `createStartHandler` lets you rewrite asset URLs at runtime — for example, prepending a CDN origin that is only known when the server starts.

## Why Runtime URL Rewriting?

Vite's `base` config is evaluated at build time. If your CDN URL is determined at deploy time (via environment variables, dynamic configuration, etc.), you need a way to rewrite URLs at runtime. `transformAssetUrls` solves this for the URLs that TanStack Start manages in its manifest:

- `<link rel="modulepreload">` tags (JS preloads)
- `<link rel="stylesheet">` tags (CSS)
- The client entry `<script>` tag

## Basic Usage

### String Prefix

The simplest usage is passing a string. Every manifest asset URL will be prefixed with it:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  transformAssetUrls: process.env.CDN_ORIGIN || '',
})

export default createServerEntry({ fetch: handler })
```

If `CDN_ORIGIN` is `https://cdn.example.com` and an asset URL is `/assets/index-abc123.js`, the resulting URL will be `https://cdn.example.com/assets/index-abc123.js`.

When the string is empty (or not set), the URLs are left unchanged.

### Callback

For more control, pass a callback that receives `{ url, type }` and returns a new URL (or a `Promise` of one). By default, the transformed manifest is cached after the first request (`cache: true`), so the callback only runs once in production:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  transformAssetUrls: ({ url, type }) => {
    // Only rewrite JS and CSS, leave client entry unchanged
    if (type === 'clientEntry') return url
    return `https://cdn.example.com${url}`
  },
})

export default createServerEntry({ fetch: handler })
```

If you need per-request behavior (for example, choosing a CDN based on a header), use the object form with `cache: false`.

The `type` parameter tells you what kind of asset URL is being transformed:

| `type`            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `'modulepreload'` | JS module preload URL (`<link rel="modulepreload">`) |
| `'stylesheet'`    | CSS stylesheet URL (`<link rel="stylesheet">`)       |
| `'clientEntry'`   | Client entry module URL (used in `import('...')`)    |

### Object Form (Explicit Cache Control)

For per-request transforms — where the CDN URL depends on request-specific data like headers — use the object form with `cache: false`:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'
import { getRequest } from '@tanstack/react-start/server'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  transformAssetUrls: {
    transform: ({ url, type }) => {
      const region = getRequest().headers.get('x-region') || 'us'
      const cdnBase =
        region === 'eu'
          ? 'https://cdn-eu.example.com'
          : 'https://cdn-us.example.com'
      return `${cdnBase}${url}`
    },
    cache: false,
  },
})

export default createServerEntry({ fetch: handler })
```

The object form accepts:

| Property          | Type | Description |
| ----------------- | ---- | ----------- |
| `transform`       | `string \| (asset) => string \| Promise<string>` | A string prefix or callback, same as the shorthand forms above. |
| `createTransform` | `(ctx: { warmup: true } \| { warmup: false; request: Request }) => (asset) => string \| Promise<string>` | Async factory that runs once per manifest computation and returns a per-asset transform. Mutually exclusive with `transform`. |
| `cache`           | `boolean` | Whether to cache the transformed manifest. Defaults to `true`. |
| `warmup`          | `boolean` | When `true`, warms up the cached manifest on server startup (prod only). Defaults to `false`. |

If you need to do async work once per manifest computation (e.g. fetch a CDN origin from a service) and then transform many URLs, prefer `createTransform`:

```ts
transformAssetUrls: {
  cache: false,
  async createTransform(ctx) {
    if (ctx.warmup) {
      // optional: return a default transform during warmup
      return ({ url }) => url
    }

    const region = ctx.request.headers.get('x-region') || 'us'
    const cdnBase = await fetchCdnBaseForRegion(region)
    return ({ url }) => `${cdnBase}${url}`
  },
}
```

## Caching Behavior

By default, **all forms** of `transformAssetUrls` cache the transformed manifest after the first request (`cache: true`). This means the transform function runs once on the first request, and the result is reused for every subsequent request in production.

| Form                                   | Default cache | Behavior                                                   |
| -------------------------------------- | ------------- | ---------------------------------------------------------- |
| String prefix                          | `true`        | Computed once, cached forever in prod.                     |
| Callback                               | `true`        | Runs once on first request, cached forever in prod.        |
| Object with `cache: true` (or omitted) | `true`        | Same as above.                                             |
| Object with `cache: false`             | `false`       | Deep-clones base manifest and transforms on every request. |

Use `cache: false` only when the transform depends on per-request data (e.g., geo-routing based on request headers). For static CDN prefixes, the default `cache: true` is recommended.

### Optional Warmup (Avoid First-Request Latency)

If you're using the object form with `cache: true`, you can set `warmup: true`
to compute the transformed manifest in the background at server startup.

```ts
transformAssetUrls: {
  transform: process.env.CDN_ORIGIN || '',
  cache: true,
  warmup: true,
}
```

This has no effect in development mode, or when `cache: false`.

> **Note:** In development mode (`TSS_DEV_SERVER`), caching is always skipped regardless of the `cache` setting, so you always get fresh manifests.

## What This Does NOT Cover

`transformAssetUrls` only rewrites URLs in the TanStack Start manifest — the tags emitted during SSR for preloading and bootstrapping the application.

It does **not** rewrite asset URLs that are imported directly in your components:

```tsx
// This import resolves to a URL at build time by Vite
import logo from './logo.svg'

function Header() {
  return <img src={logo} /> // This URL is NOT affected by transformAssetUrls
}
```

For these asset imports, use Vite's `experimental.renderBuiltUrl` in your `vite.config.ts`:

```ts
// vite.config.ts
export default defineConfig({
  experimental: {
    renderBuiltUrl(filename, { hostType }) {
      if (hostType === 'js') {
        return { relative: true }
      }
      return `https://cdn.example.com/${filename}`
    },
  },
})
```
