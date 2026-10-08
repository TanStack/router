import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIsomorphicFn } from '../src/createIsomorphicFn'
import { createClientOnlyFn, createServerOnlyFn } from '../src/envOnly'

// The compiled client replaces every call of these factories, so a call that
// reaches a stub in the browser is one the compiler missed.
const uses = {
  createServerOnlyFn: () => createServerOnlyFn(() => 'secret'),
  createClientOnlyFn: () => createClientOnlyFn(() => 'client'),
  'createIsomorphicFn().server': () =>
    createIsomorphicFn()
      .server(() => 'secret')
      .client(() => 'client'),
}

/** Runs a use in the browser (`window` defined) and returns console.error. */
function runInBrowser(use: () => unknown) {
  vi.stubGlobal('window', {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  use()
  return error
}

describe('a Start factory call the compiler missed', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each(Object.entries(uses))(
    '%s is reported in the browser in development',
    (name, use) => {
      vi.stubEnv('NODE_ENV', 'development')
      expect(runInBrowser(use)).toHaveBeenCalledExactlyOnceWith(
        expect.stringContaining(`[TanStack Start] ${name}() was not compiled`),
      )
    },
  )

  it.each(Object.entries(uses))(
    '%s is not reported on the server, in tests or in production',
    (_, use) => {
      vi.stubEnv('NODE_ENV', 'development')
      const error = vi.spyOn(console, 'error').mockImplementation(() => {})
      use()
      expect(error).not.toHaveBeenCalled()
      for (const env of ['test', 'production']) {
        vi.stubEnv('NODE_ENV', env)
        expect(runInBrowser(use)).not.toHaveBeenCalled()
      }
    },
  )

  it('a bare isomorphic builder, which compiled code keeps, is not reported', () => {
    vi.stubEnv('NODE_ENV', 'development')
    expect(runInBrowser(() => createIsomorphicFn())).not.toHaveBeenCalled()
  })
})
