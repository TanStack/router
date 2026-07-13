import { beforeEach, describe, expect, it, vi } from 'vitest'

const getServerCookieMock = vi.fn<(name: string) => string | undefined>()
const setServerCookieMock = vi.fn()

vi.mock('@tanstack/start-server-core', () => ({
  getCookie: getServerCookieMock,
  setCookie: setServerCookieMock,
}))

const { getCookie, setCookie } = await import('../src/cookies')

// The cookie logic itself (client-side parsing/serialization, the httpOnly
// warning, and createCookieFns' delegation behavior) is covered by
// start-client-core's own tests. This only verifies that this package wires
// its getCookie/setCookie up to the right start-server-core functions.
describe('getCookie/setCookie', () => {
  beforeEach(() => {
    getServerCookieMock.mockReset()
    setServerCookieMock.mockReset()
  })

  it('delegates getCookie to start-server-core', () => {
    getServerCookieMock.mockReturnValue('server-value')

    expect(getCookie('token')).toBe('server-value')
    expect(getServerCookieMock).toHaveBeenCalledExactlyOnceWith('token')
  })

  it('delegates setCookie to start-server-core', () => {
    setCookie('token', 'abc123', { path: '/' })

    expect(setServerCookieMock).toHaveBeenCalledExactlyOnceWith(
      'token',
      'abc123',
      { path: '/' },
    )
  })
})
