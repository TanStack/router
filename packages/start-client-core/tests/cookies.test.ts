import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCookieFns,
  getClientCookie,
  setClientCookie,
} from '../src/cookies'

function clearDocumentCookies() {
  document.cookie.split(';').forEach((cookie) => {
    const name = cookie.split('=')[0]?.trim()
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`
    }
  })
}

describe('createCookieFns (uncompiled createIsomorphicFn runtime fallback)', () => {
  const getServerCookieMock = vi.fn<(name: string) => string | undefined>()
  const setServerCookieMock = vi.fn()

  beforeEach(() => {
    getServerCookieMock.mockReset()
    setServerCookieMock.mockReset()
  })

  // Outside of a Start-compiled bundle, createIsomorphicFn's runtime fallback
  // always resolves to the `.server()` implementation once one is
  // registered (see packages/start-fn-stubs/src/createIsomorphicFn.ts), so
  // calling the returned getCookie/setCookie here exercises the server
  // delegation, not the client branch.
  it('delegates getCookie to the provided server implementation', () => {
    getServerCookieMock.mockReturnValue('server-value')
    const { getCookie } = createCookieFns({
      getCookie: getServerCookieMock,
      setCookie: setServerCookieMock,
    })

    expect(getCookie('token')).toBe('server-value')
    expect(getServerCookieMock).toHaveBeenCalledExactlyOnceWith('token')
  })

  it('delegates setCookie to the provided server implementation', () => {
    const { setCookie } = createCookieFns({
      getCookie: getServerCookieMock,
      setCookie: setServerCookieMock,
    })

    setCookie('token', 'abc123', { path: '/' })

    expect(setServerCookieMock).toHaveBeenCalledExactlyOnceWith(
      'token',
      'abc123',
      { path: '/' },
    )
  })
})

describe('getClientCookie', () => {
  afterEach(() => {
    clearDocumentCookies()
  })

  it('reads a cookie value from document.cookie', () => {
    document.cookie = 'token=abc123'

    expect(getClientCookie('token')).toBe('abc123')
  })

  it('returns undefined for a cookie that is not present', () => {
    expect(getClientCookie('missing')).toBeUndefined()
  })
})

describe('setClientCookie', () => {
  afterEach(() => {
    clearDocumentCookies()
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('writes the cookie to document.cookie', () => {
    setClientCookie('token', 'abc123', { path: '/' })

    expect(getClientCookie('token')).toBe('abc123')
  })

  it('warns in development when httpOnly is set, since browsers silently discard the cookie', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setClientCookie('token', 'abc123', { httpOnly: true })

    expect(warnSpy).toHaveBeenCalledExactlyOnceWith(
      expect.stringContaining('HttpOnly'),
    )
    // Per the WHATWG cookie spec, browsers discard the entire cookie (not
    // just the HttpOnly attribute) when it's set via `document.cookie` with
    // `HttpOnly` present.
    expect(getClientCookie('token')).toBeUndefined()
  })

  it('does not warn when httpOnly is not set', () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setClientCookie('token', 'abc123')

    expect(warnSpy).not.toHaveBeenCalled()
  })

  it('does not warn in production even when httpOnly is set', () => {
    vi.stubEnv('NODE_ENV', 'production')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    setClientCookie('token', 'abc123', { httpOnly: true })

    expect(warnSpy).not.toHaveBeenCalled()
  })
})
