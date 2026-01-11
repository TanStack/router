---
title: Internationalization (i18n)
---

TanStack Router provides flexible and highly customizable primitives that can be composed to support common internationalization (i18n) routing patterns, such as **optional path parameters**, **route rewriting**, and **type-safe params**. This enables clean, SEO-friendly URLs, flexible locale handling, and seamless integration with i18n libraries.

This guide covers:

- Prefix-based and optional-locale routing
- Advanced routing patterns for i18n
- Language navigation and switching
- SEO considerations
- Type safety
- Integration patterns with i18n libraries (e.g. Paraglide)

# Integration with TanStack Router

The base of this guide is built with TansTack Router. Check out the guide on integrating [i18n in TanStack Router](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n).

If you already set up the TanStack Router with i18n. This guide will be suitable when:

- You use TanStack Start
- You need SSR or streaming
- You want locale-aware redirects and metadata

## Library integrations

### TanStack Start + Paraglide

**GitHub example:**
[https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide)

First, check out [TanStack Router + Paraglide integration guide](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n#tanstack-router-paraglide)

#### Server Middleware (SSR)

```ts
import { paraglideMiddleware } from './paraglide/server'

export default {
  fetch(req: Request) {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

#### HTML Language Attribute

Set the lang attribute in html at \_\_root.tsx:

```tsx
import { getLocale } from '../paraglide/runtime'

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang={getLocale()}>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
```

### Prerendering Localized Routes

```ts
import { localizeHref } from './paraglide/runtime'

export const prerenderRoutes = ['/', '/about'].map((path) => ({
  path: localizeHref(path),
  prerender: { enabled: true },
}))
```

In vite.config.ts:

```ts
tanstackStart({
  prerender: {
    // Enable prerendering
    enabled: true,

    // Whether to extract links from the HTML and prerender them also
    crawlLinks: true,
  },
  pages: [
    {
      path: '/my-page',
      prerender: { enabled: true, outputPath: '/my-page/index.html' },
    },
  ],
})
```

## Additional i18n Integration Patterns

### Intlayer (TanStack Start integration)

[https://intlayer.org/doc/environment/tanstack-start](https://intlayer.org/doc/environment/tanstack-start)

### use-intl (TanStack Start integration)

[https://nikuscs.com/blog/13-tanstackstart-i18n/](https://nikuscs.com/blog/13-tanstackstart-i18n/)
