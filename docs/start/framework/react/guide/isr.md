---
id: isr
title: Incremental Static Regeneration (ISR)
---

TanStack Start supports build-time prerendering and dynamic server rendering. It does **not** install an incremental regeneration service when you set cache headers. The deployment's static asset server or response cache determines what happens on the next request.

Choose a freshness policy for each page:

| Page                    | How it is served                                 | How new content becomes visible                                                        |
| ----------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Public, build-time HTML | A generated file from the host's static assets   | Rebuild and deploy the file; account for the host's asset cache                        |
| Public, dynamic SSR     | A host-specific response cache in front of Start | A cache miss runs SSR again; the example below uses expiry, without background refresh |
| Personalized HTML       | Start handles each request with authentication   | Read request-scoped data and send `Cache-Control: private, no-store`                   |

A cache hit can avoid SSR and loader work. The benefit depends on cache hit rate and how much of your application is public; this guide makes no field-performance or Core Web Vitals improvement claim.

## Public build-time HTML

Use top-level `pages` with concrete paths. `prerender.routes` is not a supported option, and a wildcard such as `/posts/*` does not enumerate posts. List their URLs, or deliberately enable discovery/crawling as described in [Static Prerendering](./static-prerendering.md).

This explicit allowlist generates only `/static`:

<!-- ::start:tabs variant="bundler" -->

# Vite

```ts title="vite.config.ts"
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    tanstackStart({
      pages: [{ path: '/static' }],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
      },
    }),
    viteReact(),
  ],
})
```

# Rsbuild

```ts title="rsbuild.config.ts"
import { defineConfig } from '@rsbuild/core'
import { pluginReact } from '@rsbuild/plugin-react'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    pluginReact(),
    tanstackStart({
      pages: [{ path: '/static' }],
      prerender: {
        enabled: true,
        autoStaticPathsDiscovery: false,
        crawlLinks: false,
      },
    }),
  ],
})
```

<!-- ::end:tabs -->

Keep your host's adapter configuration alongside these plugins. With the default client output directory and subfolder index behavior, `/static` produces `dist/client/static/index.html`. Deploy the client output as static assets and configure the host to serve matching files before invoking SSR. On Cloudflare, retain the Cloudflare Vite plugin and [static-assets-first routing](https://developers.cloudflare.com/workers/static-assets/routing/worker-script/); `run_worker_first` changes that routing. Cloudflare's [HTML handling](https://developers.cloudflare.com/workers/static-assets/routing/advanced/html-handling/) can redirect `/static` to `/static/`.

Prerendering writes the response body to a file. It does not turn the route's response headers into static-host configuration or a regeneration schedule. Set static asset headers through your host. Expiry, a purge, or a request with `Cache-Control: no-cache` can fetch the same old file again. To publish updated content, rebuild and deploy it, then follow the host's asset invalidation policy. If you need request-time refresh, leave that URL out of prerendering and send it to dynamic SSR instead.

Never prerender a page containing account data, session-derived data, or secrets. Static asset delivery may bypass all request-time authorization, including `beforeLoad`.

## Public dynamic SSR on Cloudflare Workers

Cloudflare's default CDN behavior [does not cache HTML automatically](https://developers.cloudflare.com/cache/concepts/default-cache-behavior/). Setting `Cache-Control` on a Worker response alone is not the cache integration shown here. The [Workers Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/) requires explicit `match` and `put` calls and does not implement `stale-while-revalidate` or `stale-if-error` from those directives.

The following example uses the Cache API for one reviewed public document, `/`. Do not prerender `/`: a static file could intercept the request before this handler. Start with the [Cloudflare hosting setup](./hosting.md), set Wrangler's `main` to `src/server.ts`, and generate your Worker types with `wrangler types` as in Cloudflare's [custom entrypoint instructions](https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/#custom-entrypoints).

Opt in only the public route to this exact five-second policy:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  headers: () => ({
    'Cache-Control': 'public, max-age=0, s-maxage=5',
  }),
  // Add your public loader and component here.
})
```

Use the following server entry. Its request allowlist and response checks are both required. Other routes, server functions, credentials, non-GET methods, conditional/range requests and explicit cache bypass requests go through Start. Query strings and `Accept-Language` get distinct keys. Routes must not vary on other unkeyed inputs such as geography, experiments or custom headers; keep those routes out of the allowlist or design and test their cache keys first.

```ts title="src/server.ts"
import handler from '@tanstack/react-start/server-entry'
import { waitUntil } from 'cloudflare:workers'

// Five seconds makes this example's expiry easy to observe locally.
const publicCacheControl = 'public, max-age=0, s-maxage=5'

export default {
  async fetch(request: Request) {
    const url = new URL(request.url)
    // Only this explicitly reviewed public document can use the shared cache.
    const eligible =
      process.env.NODE_ENV === 'production' &&
      request.method === 'GET' &&
      url.pathname === '/' &&
      request.headers.get('accept')?.includes('text/html') &&
      ![
        'cookie',
        'authorization',
        'range',
        'if-match',
        'if-none-match',
        'if-range',
        'if-unmodified-since',
        'if-modified-since',
        'cache-control',
        'pragma',
        'origin',
      ].some((name) => request.headers.has(name))

    if (!eligible) {
      return downstream(await handler.fetch(request), 'BYPASS')
    }

    // Keep the entire search string, and partition header-based locale variants.
    // Use a separate namespace so these keys cannot collide with static assets.
    const cache = await caches.open('public-html-v1')
    const keyUrl = new URL(request.url)
    keyUrl.search += `${keyUrl.search ? '&' : '?'}__html_language=${encodeURIComponent(request.headers.get('accept-language') ?? '')}`
    const key = new Request(keyUrl)
    const cached = await cache.match(key)
    if (cached) {
      return downstream(cached, 'HIT')
    }

    const response = await handler.fetch(request)
    const varies = (response.headers.get('vary') ?? '')
      .toLowerCase()
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (
      response.status !== 200 ||
      !response.headers.get('content-type')?.startsWith('text/html') ||
      response.headers.has('set-cookie') ||
      response.headers.has('content-encoding') ||
      response.headers.get('cache-control') !== publicCacheControl ||
      varies.some(
        (name) => name !== 'accept-encoding' && name !== 'accept-language',
      )
    ) {
      return downstream(response, 'BYPASS')
    }

    // The cache consumes its own stream while the original streams to the client.
    waitUntil(
      cache.put(key, response.clone()).catch((error) => {
        console.error('Could not cache public HTML', error)
      }),
    )
    return downstream(response, 'MISS')
  },
}

function downstream(response: Response, status: string) {
  const result = new Response(response.body, response)
  // Only the explicit Worker cache owns freshness; browsers must contact it.
  result.headers.set('Cache-Control', 'private, no-store')
  result.headers.set('X-HTML-Cache', status)
  return result
}
```

Caching is disabled during development so HMR does not reuse old HTML. The example stores only uncompressed SSR responses; let the host handle delivery compression.

The stored response uses `s-maxage=5`. The browser-facing response uses `private, no-store`, so only this explicit Worker cache owns freshness. A hit skips Start entirely, including `beforeLoad` and loaders. Consequently, authorization-dependent routes must never enter this public allowlist. The `Set-Cookie`, status, content type, exact policy and `Vary` checks prevent writes of ineligible responses; they cannot make an incorrectly classified public route safe.

After five seconds, `cache.match` misses and that request waits for fresh SSR. There is no timer, scheduled rebuild, stale response fallback, background revalidation or request coalescing here. Concurrent misses can render more than once. A cache write is asynchronous, so a request made before it finishes can also miss. Entries can be evicted before their TTL. Increase the TTL only to match your application's acceptable staleness, updating both the route and server policy.

The handler passes the original response stream to the client and gives a clone to `cache.put` under `waitUntil`. It does not call `.text()` to buffer HTML. Limit this policy to finite public documents; long-lived or very large streams require a separate design because cloning streams can accumulate queued data and background work has host limits.

Cache API entries are local to a Cloudflare data center, without Tiered Cache replication. Local preview verifies the Worker logic, not global hit rates, eviction or purge propagation. A deployment does not by itself establish a purge policy for this application cache: change the cache namespace when a release needs to stop reading old entries. For immediate content invalidation, use Cloudflare's documented [Cache API purge mechanisms](https://developers.cloudflare.com/workers/runtime-apis/cache/#delete); a local `cache.delete` is not a global purge. Never report that content has been regenerated merely because a purge request was accepted.

For other hosts, use their documented dynamic-response cache integration and adapter requirements. Do not assume this Worker entry, a static `_headers` file, or the same headers will create an SSR cache on every platform. Verify the deployed behavior before describing it as ISR or stale-while-revalidate.

## Personalized HTML

Keep private routes out of prerendering and the public cache allowlist. Authenticate each request and keep user data on that request's context or router. For example, apply the following policy to a dashboard whose existing loader authenticates and reads the current user's data:

```tsx
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard')({
  headers: () => ({
    'Cache-Control': 'private, no-store',
  }),
  // Keep your authentication and request-scoped loader here.
})
```

Preserve `Set-Cookie`; do not strip it to force a cache hit. Check cookies and authorization **before** cache lookup, including on otherwise public URLs. Do not use `Vary: Cookie` as a substitute for excluding personalized HTML from a shared cache. Also check that your host's cache rules cannot override private responses.

## Verify the behavior

The [Cloudflare integration fixture](https://github.com/TanStack/router/tree/main/e2e/react-start/basic-cloudflare) runs this server entry with a five-second TTL, a public content source, and two test sessions. Its control endpoint is test-only and must never be deployed. From a repository checkout, after installing the prescribed Node/pnpm versions and root dependencies, run:

```sh
CI=1 NX_DAEMON=false pnpm nx run tanstack-react-start-e2e-basic-cloudflare:test:e2e --outputStyle=stream --skipRemoteCache
```

This builds the app and runs it through Cloudflare's local production preview. The checks cover generated HTML and static serving, loader bypass on hits, changed content after expiry, separate query/locale entries, private users, responses that must not be stored, and streaming with deferred data, including a disconnected client.

For your own public route, inspect **GET** responses, since this example intentionally bypasses HEAD:

```sh
curl -sS -D - -H 'Accept: text/html' http://localhost:3000/ -o /tmp/page.html
```

Repeat after the initial cache write finishes: `X-HTML-Cache` should change from `MISS` to `HIT`, and server-side loader instrumentation should not advance. Update the backing content without rebuilding; a hit should still return the cached content. After the TTL, another GET should run the loader and return the new content. Repeat with cookies, authorization, different query strings and locales, and two authenticated users. Verify actual bodies as well as headers; a header saying `HIT` alone is not proof of isolation or correct freshness.

For prerendered routes, check the generated file and request the static URL. Changing the backing content or expiring a CDN entry must not be mistaken for a rebuild. Rebuild and deploy, then verify the new file's content at the public URL.

TanStack Router's `staleTime`, `gcTime` and invalidation affect its client data cache. They do not purge a CDN or regenerate HTML. Document-cache tests should use full document requests; client navigation and server-function requests have separate data freshness policies.

## Related resources

- [Static Prerendering](./static-prerendering.md)
- [Hosting](./hosting.md)
- [Server Entry Point](./server-entry-point.md)
- [Production Checklist](./production-checklist.md)
- [Data Loading](/router/latest/docs/guide/data-loading)
