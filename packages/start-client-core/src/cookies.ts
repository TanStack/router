import { createIsomorphicFn } from '@tanstack/start-fn-stubs'
import { parse, serialize } from 'cookie-es'
import type { CookieSerializeOptions } from 'cookie-es'

export type GetCookieFn = (name: string) => string | undefined
export type SetCookieFn = (
  name: string,
  value: string,
  options?: CookieSerializeOptions,
) => void

// Exported (but not part of any package's public entry) so they can be unit
// tested directly, since `createIsomorphicFn`'s uncompiled runtime fallback
// always resolves to the `.server()` implementation once one is registered,
// making the `.client()` branch unreachable through `createCookieFns`'s
// output outside of a Start-compiled bundle.
export function getClientCookie(name: string): string | undefined {
  return parse(document.cookie)[name]
}

export function setClientCookie(
  name: string,
  value: string,
  options?: CookieSerializeOptions,
): void {
  if (options?.httpOnly && process.env.NODE_ENV !== 'production') {
    console.warn(
      '`setCookie` was called with `httpOnly: true` in the browser. Browsers silently discard cookies written via `document.cookie` when `HttpOnly` is set, so this cookie will NOT be set.',
    )
  }
  document.cookie = serialize(name, value, options)
}

/**
 * Build isomorphic `getCookie`/`setCookie` functions from a server-side
 * cookie implementation. On the server, calls delegate to the given
 * implementations (e.g. the request-scoped `getCookie`/`setCookie` from
 * `@tanstack/start-server-core`); in the browser, they read/write
 * `document.cookie` directly.
 *
 * The server implementation is injected as a parameter rather than imported
 * directly: `@tanstack/start-server-core` depends on this package, so a
 * static import in the other direction would be a circular package
 * dependency.
 */
export function createCookieFns(server: {
  getCookie: GetCookieFn
  setCookie: SetCookieFn
}): { getCookie: GetCookieFn; setCookie: SetCookieFn } {
  return {
    getCookie: createIsomorphicFn()
      .server(server.getCookie)
      .client(getClientCookie),
    setCookie: createIsomorphicFn()
      .server(server.setCookie)
      .client(setClientCookie),
  }
}
