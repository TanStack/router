# Isomorphic `getCookie` / `setCookie` — Design

## Problem

`getCookie` / `setCookie` currently only exist server-side, exported from
`@tanstack/{react,solid,vue}-start/server` (defined in
`packages/start-server-core/src/request-response.ts`). They throw if called
outside an active server request (no `H3Event` in `AsyncLocalStorage`), so
they cannot be called from client code or from isomorphic code paths that run
on both sides.

## Goal

Add isomorphic versions of `getCookie(name)` and `setCookie(name, value, options?)`
exported from the **root** of `@tanstack/react-start`, `@tanstack/solid-start`,
and `@tanstack/vue-start` (not `/server`), built with `createIsomorphicFn`, so
the same call works on the server (reads/writes the current request/response)
and on the client (reads/writes `document.cookie`).

Same function names as the existing server-only versions — no collision,
since the import path differs (`@tanstack/react-start` vs
`@tanstack/react-start/server`).

Out of scope: `getCookies` (plural, all cookies) and `deleteCookie` stay
server-only for now. `CookieSerializeOptions` is not re-exported as a type,
matching current `/server` behavior.

## Why not `start-client-core`

The root export of all three framework packages currently comes from
`export * from '@tanstack/start-client-core'`. That would be the natural home
for a shared isomorphic util, but `start-server-core`'s `package.json` already
declares a dependency on `start-client-core`. Adding the reverse dependency
(`start-client-core` → `start-server-core`, needed to call the existing server
`getCookie`/`setCookie`) would create a circular workspace dependency.

`packages/react-start`, `packages/solid-start`, and `packages/vue-start` each
already depend on **both** `start-client-core` and `start-server-core` directly,
with no cycle. So the implementation is added once per framework package
(small, ~15-line file, duplicated 3x) instead of shared. This mirrors the
existing precedent where `useServerFn` is already an independent per-framework
file rather than a shared one.

## Implementation

New file `src/cookies.ts`, identical content in `packages/react-start`,
`packages/solid-start`, `packages/vue-start`:

```ts
import { createIsomorphicFn } from '@tanstack/start-client-core'
import {
  getCookie as getServerCookie,
  setCookie as setServerCookie,
} from '@tanstack/start-server-core'
import { parse, serialize } from 'cookie-es'
import type { CookieSerializeOptions } from 'cookie-es'

type GetCookieFn = (name: string) => string | undefined
type SetCookieFn = (
  name: string,
  value: string,
  options?: CookieSerializeOptions,
) => void

export const getCookie: GetCookieFn = createIsomorphicFn()
  .server(getServerCookie)
  .client((name: string) => parse(document.cookie)[name]) as GetCookieFn

export const setCookie: SetCookieFn = createIsomorphicFn()
  .server(setServerCookie)
  .client((name: string, value: string, options?: CookieSerializeOptions) => {
    document.cookie = serialize(name, value, options)
  }) as SetCookieFn
```

Exported from each package's root `index.ts` (alongside the existing
`useServerFn` export), e.g. in `packages/react-start/src/index.ts`:

```ts
export { getCookie, setCookie } from './cookies'
```

### Behavior

- **Server branch** delegates directly to the existing
  `start-server-core` implementation — no server-side logic is duplicated.
  Same request-scoped behavior as today (throws outside an active request).
- **Client branch** uses `cookie-es`'s `parse`/`serialize` against
  `document.cookie`, giving the same option semantics (`path`, `maxAge`,
  `expires`, `domain`, `secure`, `sameSite`, etc.) as the server. `httpOnly` is
  silently ignored by the browser when set from client-side JS — expected,
  unavoidable, and consistent with any client-side cookie write.
- The Start compiler strips whichever branch doesn't match the build target
  (documented behavior of `createIsomorphicFn`), so `document.cookie` never
  reaches the server bundle and the `start-server-core` import never reaches
  the client bundle.

### New dependency

Add `cookie-es` (`^3.0.0`, matching `start-server-core`'s existing range) to
the `dependencies` of `react-start`, `solid-start`, and `vue-start`
`package.json`.

## Testing

There's no existing unit-test precedent for these small per-framework wrapper
files (`useServerFn`, `createCsrfMiddleware` have none either); verification
relies on typecheck/build passing. Existing e2e cookie fixtures at
`e2e/{react,solid,vue}-start/server-functions/src/routes/cookies/set.tsx`
are a candidate for extension to exercise the new root-level
`getCookie`/`setCookie`, but that's optional and not required for this change.