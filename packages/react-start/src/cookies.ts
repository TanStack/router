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
  .client((name: string) => parse(document.cookie)[name]) as GetCookieFn

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
  .client((name: string, value: string, options?: CookieSerializeOptions) => {
    document.cookie = serialize(name, value, options)
  }) as SetCookieFn
