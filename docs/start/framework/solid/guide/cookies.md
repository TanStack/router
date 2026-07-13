---
id: cookies
title: Cookies
---

Start ships two ways to read and write cookies:

- **Server-only**: `getCookie`/`setCookie`/`getCookies`/`deleteCookie` from `@tanstack/solid-start/server`. These only work inside an active server request (a server function, request middleware, or a server route) and throw otherwise.
- **Isomorphic**: `getCookie`/`setCookie` from the root of `@tanstack/solid-start`. The same call works on the server _and_ in the browser — pick this when a component or a shared helper needs to read/write a cookie regardless of which side it renders on.

## Isomorphic `getCookie`/`setCookie`

```tsx
import { getCookie, setCookie } from '@tanstack/solid-start'
```

These are built with [`createIsomorphicFn`](./environment-functions): on the server they delegate to the same request-scoped cookie handling as the `/server` versions; in the browser they read/write `document.cookie` directly.

```tsx
import { createSignal } from 'solid-js'
import { getCookie, setCookie } from '@tanstack/solid-start'

export const getServerNow = createServerFn().handler(async () => {
  // Runs on the server: reads the incoming request's `Cookie` header.
  const theme = getCookie('theme') ?? 'light'
  return theme
})

function ThemeToggle() {
  const [theme, setTheme] = createSignal(getCookie('theme') ?? 'light')

  return (
    <button
      onClick={() => {
        const next = theme() === 'light' ? 'dark' : 'light'
        // Runs in the browser: writes `document.cookie` directly.
        setCookie('theme', next, { path: '/', maxAge: 60 * 60 * 24 * 365 })
        setTheme(next)
      }}
    >
      Switch to {theme() === 'light' ? 'dark' : 'light'}
    </button>
  )
}
```

## `HttpOnly` only works on the server

`setCookie`'s `options` accept the same [`CookieSerializeOptions`](https://github.com/unjs/cookie-es) as the server-only version, including `httpOnly`. But `HttpOnly` is a protection against client-side JavaScript reading the cookie — so it can only be set from the server.

If `setCookie` runs in the browser (the client branch) with `httpOnly: true`, the browser doesn't just ignore the flag — it silently discards the entire cookie write. `setCookie` logs a `console.warn` in development to help catch this, but there's no way to recover the write: if a cookie needs `HttpOnly`, set it from a server function or request middleware, not from client code.

```tsx
// ❌ Runs in the browser: the cookie is never actually set.
setCookie('session', token, { httpOnly: true })

// ✅ Runs on the server: `HttpOnly` is honored.
export const login = createServerFn().handler(async () => {
  setCookie('session', token, { httpOnly: true })
})
```

## When to use the server-only versions instead

Reach for `getCookie`/`setCookie`/`getCookies`/`deleteCookie` from `@tanstack/solid-start/server` when the code only ever runs on the server (a server function handler, request middleware, or a server route) and you don't need it to also work in the browser — for example, reading a locale cookie inside request middleware, as shown in [Hydration Errors](./hydration-errors). Calling the server-only versions from client code throws instead of silently doing something unexpected.
