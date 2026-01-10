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
- Integration patterns with i18n libraries (Paraglide)


## Server-side i18n (TanStack Start)

This pattern integrates i18n at the routing and server layers. It is suitable when:

- You use TanStack Start
- You need SSR or streaming
- You want locale-aware redirects and metadata

### TanStack Start + Paraglide

**GitHub example:**
[https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide](https://github.com/TanStack/router/tree/main/examples/react/start-i18n-paraglide)

### Server Middleware (SSR)

```ts
import { paraglideMiddleware } from './paraglide/server'

export default {
  fetch(req: Request) {
    return paraglideMiddleware(req, () => handler.fetch(req))
  },
}
```

### HTML Language Attribute

```tsx
import { getLocale } from '../paraglide/runtime'

<html lang={getLocale()} />
```

---

## Prerendering Localized Routes

```ts
import { localizeHref } from './paraglide/runtime'

export const prerenderRoutes = ['/', '/about'].map((path) => ({
  path: localizeHref(path),
  prerender: { enabled: true },
}))
```

---

## Additional i18n Integration Patterns

### Intlayer (TanStack Start integration)

[https://intlayer.org/doc/environment/tanstack-start](https://intlayer.org/doc/environment/tanstack-start)

### use-intl (TanStack Start integration)

[https://nikuscs.com/blog/13-tanstackstart-i18n/](https://nikuscs.com/blog/13-tanstackstart-i18n/)
