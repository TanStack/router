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

// Exported (but not part of the package's public entry) so they can be unit
// tested directly, since `createIsomorphicFn`'s uncompiled runtime fallback
// always resolves to the `.server()` implementation once one is registered,
// making the `.client()` branch unreachable through `getCookie`/`setCookie`
// outside of a Start-compiled bundle.
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
 * Get a cookie value by name. Works on both the server (reads the current
 * request's `Cookie` header) and the client (reads `document.cookie`).
 * @param name Name of the cookie to get
 * @returns Value of the cookie, or `undefined` if not present
 * ```ts
 * const authorization = getCookie('Authorization')
 * ```
 */
export const getCookie: GetCookieFn = createIsomorphicFn()
  .server(getServerCookie)
  .client(getClientCookie)

/**
 * Set a cookie value by name. Works on both the server (sets a `Set-Cookie`
 * header on the current response) and the client (writes `document.cookie`).
 * @param name Name of the cookie to set
 * @param value Value of the cookie to set
 * @param options Options for serializing the cookie
 * ```ts
 * setCookie('Authorization', '1234567')
 * ```
 */
export const setCookie: SetCookieFn = createIsomorphicFn()
  .server(setServerCookie)
  .client(setClientCookie)
