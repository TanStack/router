---
id: css-styling
title: CSS Styling
---

TanStack Start supports the CSS patterns your bundler supports, and adds SSR-aware route asset discovery on top. The important distinction is whether CSS is rendered as an explicit route `head().links` stylesheet, or whether it is discovered from the route's JavaScript/CSS module graph.

That distinction affects SSR stylesheet tags, Early Hints, `transformAssets`, and CSS inlining.

## CSS URL Imports

Import CSS with `?url` when you want a URL string for the emitted stylesheet and want to render the `<link rel="stylesheet">` yourself.

```tsx
// src/routes/__root.tsx
/// <reference types="vite/client" />
import { createRootRoute } from '@tanstack/react-router'
import appCss from '../styles/app.css?url'

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
})
```

This pattern is useful for explicit global stylesheets, especially when you already want the stylesheet to be part of route `head()` output. The CSS file is emitted by the bundler and the URL is placed in the final document by `HeadContent`.

`?url` imports are not Start manifest-managed stylesheet assets. Because of that:

- They are discovered when route `head()` runs, not during static manifest discovery.
- They can appear in the `dynamic` Early Hints phase as route `head().links` entries.
- They are not passed through Start's runtime `transformAssets` option.
- They are not eligible for Start CSS inlining.

## Side-Effect CSS Imports

Import CSS without assigning it when you want global CSS classes or styles to be bundled as a dependency of the route/component module.

```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import '../styles/global.css'

export const Route = createFileRoute('/')({
  component: Home,
})

function Home() {
  return <div className="global-container">Global CSS</div>
}
```

The class names remain global. Start discovers the generated CSS asset from the client build and attaches it to the matching route manifest entry. During SSR, `HeadContent` renders stylesheet links for the matched route tree, so the page is styled before hydration.

Where you import the file controls the scope:

- Import in the root route or app shell to apply it to every page.
- Import in a leaf route to apply it only when that route's chunk is part of the match.
- Import from a component loaded with `import()` or `React.lazy` only when the CSS is not needed for the initial route render. That CSS loads with the async chunk instead of being part of Start's static route manifest, so it is not rendered as an initial SSR `<link rel="stylesheet">` by `HeadContent`, and it is not available for static Early Hints or CSS inlining.

Manifest-managed CSS from side-effect imports can be included in static Early Hints, transformed with `transformAssets`, and inlined with Start CSS inlining.

## CSS Modules

CSS modules work the same way as side-effect CSS imports from Start's route discovery perspective, but the class names are scoped by the bundler.

```tsx
// src/routes/modules.tsx
import { createFileRoute } from '@tanstack/react-router'
import styles from '../styles/card.module.css'

export const Route = createFileRoute('/modules')({
  component: Modules,
})

function Modules() {
  return <div className={styles.card}>Scoped CSS module</div>
}
```

The generated stylesheet is discovered from the route chunk graph, linked during SSR for matched routes, and loaded during client navigation when the route chunk loads. CSS modules are the best fit for route-local or component-local styling where you want scoped class names.

Like side-effect CSS imports, CSS modules can be included in static Early Hints, transformed with `transformAssets`, and inlined with Start CSS inlining.

## Choosing a Pattern

| Pattern                               | Use For                               | Discovery                        | Early Hints     | CSS Inlining |
| ------------------------------------- | ------------------------------------- | -------------------------------- | --------------- | ------------ |
| `import css from '?url'`              | Explicit stylesheet links in `head()` | Runtime route `head()` discovery | `dynamic` phase | No           |
| `import './global.css'`               | Global classes in the route graph     | Static Start manifest discovery  | `static` phase  | Yes          |
| `import styles from './x.module.css'` | Scoped classes in the route graph     | Static Start manifest discovery  | `static` phase  | Yes          |

Use `?url` when the stylesheet is part of your route head contract. Use side-effect CSS imports or CSS modules when you want Start to treat the stylesheet as a route asset.

## Discovery and Early Hints

Start has two relevant discovery points for stylesheet assets.

Static manifest discovery happens at build time. Start inspects the client build output, records CSS emitted for route chunks, and uses that manifest during SSR. These CSS assets are available before route loaders complete, so they can be emitted during the `static` Early Hints phase as `rel=preload; as=style` links.

Dynamic head discovery happens after `router.load()` when route `head()` results are known. This is where `?url` stylesheet links appear. These links can be emitted during the `dynamic` Early Hints phase, along with other supported route `head().links` entries.

The phases matter when you send Early Hints:

- `static` hints are earliest and include manifest-managed CSS from side-effect imports and CSS modules.
- `dynamic` hints are redirect-safe and include `?url` stylesheet links returned from route `head()`.
- If you send `allLinks` in the `dynamic` phase, Start can coalesce static manifest assets and dynamic head links into one response.
- If CSS inlining is enabled, inlined manifest-managed stylesheet assets are skipped by static Early Hints because they are embedded in the HTML.

See the [Early Hints guide](./early-hints) for the full callback and response header APIs.

## CSS Inlining

> **Experimental:** CSS inlining is experimental and subject to change.

CSS inlining embeds Start manifest-managed route CSS directly into the server-rendered HTML response for production builds. This can improve the first render by avoiding blocking stylesheet requests for the CSS needed by the initial route match.

Enable it with `server.build.inlineCss` in the Start plugin options. Passing `true` is shorthand for `{ enabled: true, transformAssets: false }`:

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        build: {
          inlineCss: true,
        },
      },
    }),
  ],
})
```

For Rsbuild, use the same Start option:

```ts
// rsbuild.config.ts
import { defineConfig } from '@rsbuild/core'
import { tanstackStart } from '@tanstack/react-start/plugin/rsbuild'

export default defineConfig({
  plugins: [
    tanstackStart({
      server: {
        build: {
          inlineCss: true,
        },
      },
    }),
  ],
})
```

This option only affects production builds. Development mode keeps using Start's normal development CSS handling.

If you need `transformAssets` to rewrite `url(...)` or `@import` references inside the inlined CSS at runtime, opt into build-time CSS URL templates:

```ts
tanstackStart({
  server: {
    build: {
      inlineCss: {
        enabled: true,
        transformAssets: true,
      },
    },
  },
})
```

CSS inlining applies to CSS discovered from side-effect imports and CSS modules, because those stylesheets are Start manifest assets. It does not inline CSS imported with `?url` and returned from `head().links`, because those links are dynamic route head output rather than manifest-managed stylesheet assets.

When CSS inlining is enabled, Start still emits the CSS files in the client build. It only changes the SSR document: stylesheet links managed by the Start manifest are replaced with a single inline `<style>` tag for the matched routes. The inline style is preserved during hydration to avoid duplicate stylesheet links and hydration mismatches.

You can also control inlining at runtime in your server entry. This only affects builds that were created with `server.build.inlineCss` enabled:

```tsx
import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { createServerEntry } from '@tanstack/react-start/server-entry'

const handler = createStartHandler({
  handler: defaultStreamHandler,
  inlineCss: ({ request }) => request.headers.get('x-inline-css') !== 'false',
})

export default createServerEntry({ fetch: handler })
```

For custom runtime wrappers, `handler(request, { inlineCss })` overrides the handler-level `inlineCss` setting for that request:

```tsx
export default createServerEntry({
  fetch(request) {
    return handler(request, {
      inlineCss: request.headers.get('x-inline-css') !== 'false',
    })
  },
})
```

### URL Rebasing

If an inlined stylesheet contains relative `url(...)` or `@import` references, Start rebases them relative to the emitted CSS asset URL before embedding the CSS.

For example, when the generated stylesheet is served from `/_build/assets/dashboard.css`:

```css
.card {
  background-image: url('./dot.svg');
}
```

Start embeds it as:

```css
.card {
  background-image: url(/_build/assets/dot.svg);
}
```

Root-relative URLs are left unchanged at build time, but can still be transformed at runtime with `transformAssets`. Absolute URLs, protocol-relative URLs, data URLs, and hash references are left unchanged and are not passed to `transformAssets`.

### Asset Transforms

When CSS is inlined, there is no stylesheet `<link>` left for `transformAssets` to rewrite. That is usually the point: the browser does not need to fetch the stylesheet separately.

For URLs inside the CSS content, such as fonts or background images, Start calls `transformAssets` with `kind: 'css-url'` only when the build was created with `server.build.inlineCss: { enabled: true, transformAssets: true }`. The context also includes `stylesheetHref`, and relative CSS URLs are resolved against that stylesheet href before your transform runs.

```tsx
createStartHandler({
  handler: defaultStreamHandler,
  transformAssets: (asset) => {
    if (asset.kind === 'css-url') {
      return `https://cdn.example.com${asset.url}`
    }

    return asset.url
  },
})
```

See the [CDN Asset URLs guide](./cdn-asset-urls#inlined-css-urls) for the full `transformAssets` reference.

### Tradeoffs

CSS inlining is useful when the matched route CSS is small enough that putting it in the HTML is cheaper than an extra stylesheet request. It can be less effective when your initial route loads a large global stylesheet that would otherwise be cached as a separate file.

Consider these tradeoffs before enabling it:

- The HTML response becomes larger.
- First-load CSS can no longer be cached independently from the HTML response.
- Strict Content Security Policy setups must allow the inline style. Configure `ssr.nonce` on the router so `HeadContent` can apply the nonce to rendered `<style>` tags, including inlined CSS.
- CSS files are still emitted for client navigation and browser caching after the initial response.

Use CSS inlining when the reduced request overhead is worth the larger HTML response for your deployment and route structure.
