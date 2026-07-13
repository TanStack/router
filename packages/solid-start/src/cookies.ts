import { createCookieFns } from '@tanstack/start-client-core/cookies'
import {
  getCookie as getServerCookie,
  setCookie as setServerCookie,
} from '@tanstack/start-server-core'

const cookieFns = createCookieFns({
  getCookie: getServerCookie,
  setCookie: setServerCookie,
})

/**
 * Get a cookie value by name. Works on both the server (reads the current
 * request's `Cookie` header) and the client (reads `document.cookie`).
 * @param name Name of the cookie to get
 * @returns Value of the cookie, or `undefined` if not present
 * ```ts
 * const authorization = getCookie('Authorization')
 * ```
 */
export const getCookie = cookieFns.getCookie

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
export const setCookie = cookieFns.setCookie
