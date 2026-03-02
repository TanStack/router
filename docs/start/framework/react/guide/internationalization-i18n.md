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

This guide assumes you are using TanStack Start, which builds on TanStack Router. For Router-specific i18n patterns, see the [TanStack Router i18n guide](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n).

This guide is most relevant when:

- You are using TanStack Start
- You need SSR or streaming support
- You need locale-aware redirects or metadata

## Library Integration Examples

### TanStack Start + Paraglide

**GitHub example:**
[https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide)

Refer to the [TanStack Router + Paraglide integration guide](https://tanstack.com/start/latest/docs/framework/react/guide/internationalization-i18n#tanstack-router-paraglide) for Router-level configuration details.

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

Set the lang attribute in `__root.tsx` so the document reflects the active locale:

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

#### Prerendering Localized Routes

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
