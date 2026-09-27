---
name: start-server-core
description: >-
  Server-side runtime for TanStack Start: createStartHandler,
  request/response utilities (getRequest, setResponseHeader,
  setCookie, getCookie, appendResponseHeader), three-phase request handling,
  AsyncLocalStorage context.
metadata:
  type: core
  library: tanstack-start
  library_version: '1.169.17'
sources:
  - TanStack/router:packages/start-server-core/src
  - TanStack/router:docs/start/framework/react/guide/server-entry-point.md
---

# Start Server Core (`@tanstack/start-server-core`)

Server-side runtime for TanStack Start. Provides the request handler, request/response utilities, cookie management, and integration primitives for external session libraries. All utilities are available anywhere in the call stack during a request via AsyncLocalStorage.

> **CRITICAL**: These utilities are SERVER-ONLY. Import them from `@tanstack/<framework>-start/server`, not from the main entry point. They throw if called outside a server request context.
>
> **CRITICAL**: Types are FULLY INFERRED. Never cast, never annotate inferred values.
>
> **CRITICAL**: Read cookies, headers, request URLs, and runtime environment values inside the active request. Do not capture them at module scope; edge runtimes may inject them per request, and concurrent requests must never share request-derived state.

## `createStartHandler`

Creates the main request handler that processes all incoming requests through three phases: server functions, server routes, then app SSR.

```ts
// src/server.ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createStartHandler } from '@tanstack/react-start/server'
import { defaultStreamHandler } from '@tanstack/react-start/server'

export default createStartHandler({
  handler: defaultStreamHandler,
})
```

With asset URL transforms (CDN):

```ts
export default createStartHandler({
  handler: defaultStreamHandler,
  transformAssets: 'https://cdn.example.com',
})
```

## Request Utilities

All imported from `@tanstack/<framework>-start/server`. Available anywhere during request handling — no parameter passing needed.

### Reading Request Data

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  getRequest,
  getRequestHeaders,
  getRequestHeader,
  getRequestIP,
  getRequestHost,
  getRequestUrl,
  getRequestProtocol,
} from '@tanstack/react-start/server'

const serverFn = createServerFn({ method: 'GET' }).handler(async () => {
  const request = getRequest()
  const headers = getRequestHeaders()
  const auth = getRequestHeader('authorization')
  const ip = getRequestIP({ xForwardedFor: true })
  const host = getRequestHost()
  const url = getRequestUrl()
  const protocol = getRequestProtocol()

  return { ip, host }
})
```

### Setting Response Data

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  setResponseHeader,
  setResponseHeaders,
  setResponseStatus,
  getResponseHeaders,
  getResponseHeader,
  getResponseStatus,
  appendResponseHeader,
  removeResponseHeader,
  clearResponseHeaders,
} from '@tanstack/react-start/server'

const serverFn = createServerFn({ method: 'POST' }).handler(async () => {
  setResponseStatus(201)
  setResponseHeader('x-custom', 'value')
  setResponseHeaders({ 'cache-control': 'no-store' })

  return { created: true }
})
```

`getResponseHeader` and `getResponseHeaders` are read helpers. Treat the `Headers` returned by `getResponseHeaders()` as a snapshot; mutating it does not change the outgoing response. Use the setter/removal helpers for writes.

`appendResponseHeader(name, value)` appends without replacing existing values. For `set-cookie` it accepts fully serialized cookie strings and merges them by cookie identity (name + domain + path) — the primitive for bridging external session/auth libraries:

```ts
appendResponseHeader('set-cookie', await externalSessionLib.commit())
```

## Cookie Management

```ts
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import {
  getCookies,
  getCookie,
  setCookie,
  deleteCookie,
} from '@tanstack/react-start/server'

const serverFn = createServerFn({ method: 'POST' }).handler(async () => {
  const allCookies = getCookies()
  const token = getCookie('session-token')

  setCookie('preference', 'dark', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })

  deleteCookie('old-cookie')
})
```

## External Session Libraries

Start has no built-in session API. Use an external library and connect it to the active request using the cookie helpers, serialized headers, or a Fetch handler.

For a cookie adapter, iron-session 9 accepts Start's cookie functions directly:

```ts
import { getIronSession } from 'iron-session'
import { getCookie, setCookie } from '@tanstack/react-start/server'

// This is an application helper, not a Start export.
export function getAppSession() {
  const password = process.env.SESSION_SECRET
  if (!password || password.length < 32) {
    throw new Error('SESSION_SECRET must be at least 32 characters')
  }

  return getIronSession<{ userId: string }>(
    { read: getCookie, write: setCookie },
    {
      cookieName: 'app-session',
      password,
      ttl: 7 * 24 * 60 * 60,
      cookieOptions: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
      },
    },
  )
}

// After validating credentials in a server function:
const session = await getAppSession()
session.userId = user.id
await session.save()

// In a logout handler:
const logoutSession = await getAppSession()
logoutSession.destroy()
```

Use `session.userId`, with an absent-user check, when reading. Keep one session object per operation, or pass it from middleware through request context. The adapter reads the incoming cookie; calling it again does not read pending response cookies. Await writes before returning or redirecting. Do not put a session object or request-derived configuration in module scope.

iron-session checks `ttl` when unsealing, and each save renews that lifetime. Choose and test expiration, rotation, and storage behavior explicitly.

For libraries that accept a Fetch `Request` and return a `Response`, pass the current request and return the library's response from a server route. For cookie-only transfer, append each value from `response.headers.getSetCookie()` separately; commas can occur inside an `Expires` attribute. Do not use `setResponseHeader('set-cookie', ...)` to append alongside unrelated cookies.

### Production Session Rules

- Keep credentials and session objects in server code; use a new object for each request.
- Load current account permissions from the authoritative store. A client route guard does not authorize a server function.
- Use server-side session records for immediate revocation, device tracking, or large data. Deleting a cookie does not invalidate copies of stateless credentials.
- Use `HttpOnly`, an appropriate `SameSite`, `Path=/`, and `Secure` on HTTPS deployments. Cookie flags complement CSRF protection.
- Test login, authenticated SSR and navigation, persistence before redirects, expiry, logout, and concurrent requests. Start handles request/response plumbing; the application and its session library own session semantics.

## How Request Handling Works

`createStartHandler` processes requests in three phases:

1. **Server Function Dispatch** — If URL matches the server function prefix (`/_serverFn`), deserializes the payload, runs global request middleware, executes the server function, and returns the serialized result.

2. **Server Route Handler** — For non-server-function requests, matches the URL against routes with `server.handlers`. Runs route middleware, then the matched HTTP method handler. Handlers can return a `Response` or call `next()` to fall through to SSR.

3. **App Router SSR** — Loads all route loaders, dehydrates state for client hydration, and calls the handler callback (e.g., `defaultStreamHandler`) to render HTML.

## Common Mistakes

### 1. CRITICAL: Importing server utilities in client code

Server utilities use AsyncLocalStorage and only work during server request handling. Importing them in client code causes build errors or runtime crashes.

```ts
// WRONG — importing in a component file that runs on client
import { getCookie } from '@tanstack/react-start/server'

function MyComponent() {
  const token = getCookie('auth') // crashes on client
}

// CORRECT — use inside server functions only
// Use @tanstack/<framework>-start for your framework (react, solid, vue)
import { createServerFn } from '@tanstack/react-start'
import { getCookie } from '@tanstack/react-start/server'

const getAuth = createServerFn({ method: 'GET' }).handler(async () => {
  return getCookie('auth')
})
```

### 2. HIGH: Forgetting to persist an external session

Mutating a session object does not necessarily write a cookie. Follow the library's explicit save or commit API and await it before returning or redirecting. Append serialized `Set-Cookie` values individually, preserving cookies from other middleware.

### 3. MEDIUM: Using session without HTTPS in production

Session cookies should use `secure: true` in production. The default cookie options may not enforce this.

### 4. CRITICAL: Capturing request or environment state at module scope

Do not create session config from `process.env` at module load or cache `getRequest()`, headers, cookies, or session data in a module variable. Create config and read request state inside the handler or middleware callback. This is required for per-request edge environments and prevents cross-request data leaks.

## Cross-References

- [start-core/server-functions](../../../start-client-core/skills/start-core/server-functions/SKILL.md) — creating server functions that use these utilities
- [start-core/middleware](../../../start-client-core/skills/start-core/middleware/SKILL.md) — request middleware
- [start-core/server-routes](../../../start-client-core/skills/start-core/server-routes/SKILL.md) — server route handlers
