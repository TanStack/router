---
id: cdn-asset-urls
title: CDN Asset URLs
---

# CDN Asset URLs

> **Experimental:** `transformAssets` is experimental and subject to change.

When deploying to production, you may want to serve your static assets (JavaScript, CSS) from a CDN. The `transformAssets` option on `createStartHandler` lets you rewrite asset URLs at runtime - for example, prepending a CDN origin that is only known when the server starts.

`transformAssetUrls` still works, but it is deprecated and now delegates to `transformAssets` with a development warning.

## Why Runtime URL Rewriting?

Vite's `base` config is evaluated at build time. If your CDN URL is determined at deploy time (via environment variables, dynamic configuration, etc.), you need a way to rewrite URLs at runtime. `transformAssets` solves this for the URLs that TanStack Start manages in its manifest:

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
  transformAssets: process.env.CDN_ORIGIN || '',
})

export default createServerEntry({ fetch: handler })
```

If `CDN_ORIGIN` is `https://cdn.example.com` and an asset URL is `/assets/index-abc123.js`, the resulting URL will be `https://cdn.example.com/assets/index-abc123.js`.

When the string is empty (or not set), the URLs are left unchanged.

### Object Shorthand (Prefix + CrossOrigin)

If you also need to set `crossOrigin` on manifest-managed `<link>` tags, use the object shorthand with `prefix` and `crossOrigin`:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  transformAssets: {
    prefix: process.env.CDN_ORIGIN || '',
    crossOrigin: 'anonymous',
  },
})

export default createServerEntry({ fetch: handler })
```

`crossOrigin` accepts either a single value applied to all asset kinds, or a per-kind record (matching the `HeadContent assetCrossOrigin` shape):

```tsx
transformAssets: {
  prefix: 'https://cdn.example.com',
  crossOrigin: {
    modulepreload: 'anonymous',
    stylesheet: 'use-credentials',
  },
}
```

Kinds not listed in the per-kind record receive no `crossOrigin` attribute. Like the string shorthand, the object shorthand is always cached (`cache: true`).

### Callback

For more control, pass a callback that receives `{ kind, url }` and returns a string, or `{ href, crossOrigin? }` (or a `Promise` of either). By default, the transformed manifest is cached after the first request (`cache: true`), so the callback only runs once in production:

```tsx
// src/server.ts
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  transformAssets: ({ kind, url }) => {
    const href = `https://cdn.example.com${url}`

    if (kind === 'modulepreload') {
      return {
        href,
        crossOrigin: 'anonymous',
      }
    }

    return { href }
  },
})

export default createServerEntry({ fetch: handler })
```

If you need per-request behavior (for example, choosing a CDN based on a header), use the object form with `cache: false`.

The `kind` parameter tells you what kind of asset URL is being transformed:

| `kind`            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `'modulepreload'` | JS module preload URL (`<link rel="modulepreload">`) |
| `'stylesheet'`    | CSS stylesheet URL (`<link rel="stylesheet">`)       |
| `'clientEntry'`   | Client entry module URL (used in `import('...')`)    |

`crossOrigin` applies to manifest-managed link tags. For the client entry, returning `{ href }` is equivalent to returning a string.

### Object Form (Explicit Cache Control)

For per-request transforms - where the CDN URL depends on request-specific data like headers - use the object form with `cache: false`:

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
  transformAssets: {
    transform: ({ kind, url }) => {
      const region = getRequest().headers.get('x-region') || 'us'
      const cdnBase =
        region === 'eu'
          ? 'https://cdn-eu.example.com'
          : 'https://cdn-us.example.com'

      if (kind === 'modulepreload') {
        return {
          href: `${cdnBase}${url}`,
          crossOrigin: 'anonymous',
        }
      }

      return { href: `${cdnBase}${url}` }
    },
    cache: false,
  },
})

export default createServerEntry({ fetch: handler })
```

The object form accepts:

| Property          | Type                                                                                                                            | Description                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `transform`       | `string \| (asset) => string \| { href, crossOrigin? } \| Promise<...>`                                                         | A string prefix or callback, same as the shorthand forms above.                                                               |
| `createTransform` | `(ctx: { warmup: true } \| { warmup: false; request: Request }) => (asset) => string \| { href, crossOrigin? } \| Promise<...>` | Async factory that runs once per manifest computation and returns a per-asset transform. Mutually exclusive with `transform`. |
| `cache`           | `boolean`                                                                                                                       | Whether to cache the transformed manifest. Defaults to `true`.                                                                |
| `warmup`          | `boolean`                                                                                                                       | When `true`, warms up the cached manifest on server startup (prod only). Defaults to `false`.                                 |

If you need to do async work once per manifest computation (e.g. fetch a CDN origin from a service) and then transform many URLs, prefer `createTransform`:

```ts
transformAssets: {
  cache: false,
  async createTransform(ctx) {
    if (ctx.warmup) {
      return ({ url }) => ({ href: url })
    }

    const region = ctx.request.headers.get('x-region') || 'us'
    const cdnBase = await fetchCdnBaseForRegion(region)

    return ({ kind, url }) => {
      if (kind === 'modulepreload') {
        return {
          href: `${cdnBase}${url}`,
          crossOrigin: 'anonymous',
        }
      }

      return { href: `${cdnBase}${url}` }
    }
  },
}
```

## Caching Behavior

By default, all forms of `transformAssets` cache the transformed manifest after the first request (`cache: true`). This means the transform function runs once on the first request, and the result is reused for every subsequent request in production.

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
transformAssets: {
  transform: process.env.CDN_ORIGIN || '',
  cache: true,
  warmup: true,
}
```

This has no effect in development mode, or when `cache: false`.

> **Note:** In development mode (`TSS_DEV_SERVER`), caching is always skipped regardless of the `cache` setting, so you always get fresh manifests.

## With `HeadContent assetCrossOrigin`

If you want to set cross-origin behavior from the app shell instead of the server entry, `HeadContent` also accepts `assetCrossOrigin`:

```tsx
<HeadContent assetCrossOrigin="anonymous" />
```

or:

```tsx
<HeadContent
  assetCrossOrigin={{
    modulepreload: 'anonymous',
    stylesheet: 'use-credentials',
  }}
/>
```

If both `transformAssets` and `assetCrossOrigin` set a cross-origin value, `assetCrossOrigin` overrides the value from `transformAssets`.

`assetCrossOrigin` only applies to manifest-managed `modulepreload` and stylesheet links, not arbitrary links you return from route `head()` functions.

## Recommended: Set `base: ''` for Client-Side Navigation

`transformAssets` rewrites the URLs in the SSR HTML - modulepreload hints, stylesheets, and the client entry script. This means the browser's initial page load fetches all assets from the CDN.

However, when users navigate client-side (e.g., clicking a `<Link>`), TanStack Router lazy-loads route chunks using `import()` calls with paths that were baked in at build time by Vite. By default, Vite uses `base: '/'`, which produces absolute paths like `/assets/about-abc123.js`. These resolve against the app server's origin, not the CDN - even though the entry module was loaded from the CDN.

To fix this, set `base: ''` in your Vite config:

```ts
// vite.config.ts
export default defineConfig({
  base: '',
  // ... plugins, etc.
})
```

With `base: ''`, Vite generates relative import paths for client-side chunks. Since the client entry module was loaded from the CDN (thanks to `transformAssets`), all relative `import()` calls resolve against the CDN origin. This ensures that lazy-loaded route chunks during client-side navigation are also served from the CDN.

Using an empty string rather than `'./'` is important - both produce relative client-side imports, but `base: ''` preserves the correct root-relative paths (`/assets/...`) in the SSR manifest so that `transformAssets` can properly prepend the CDN origin.

| `base` setting  | SSR assets (initial load)   | Client-side navigation chunks  |
| --------------- | --------------------------- | ------------------------------ |
| `'/'` (default) | CDN (via `transformAssets`) | App server                     |
| `''`            | CDN (via `transformAssets`) | CDN (relative to entry module) |

> **Tip:** `base: ''` is recommended whenever you use `transformAssets` so that all assets - both on initial load and during client-side navigation - are consistently served from the CDN.

## What This Does Not Cover

`transformAssets` only rewrites URLs in the TanStack Start manifest - the tags emitted during SSR for preloading and bootstrapping the application.

It does not rewrite asset URLs imported directly in your components:

```tsx
// This import resolves to a URL at build time by Vite
import logo from './logo.svg'

function Header() {
  return <img src={logo} /> // This URL is NOT affected by transformAssets
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
