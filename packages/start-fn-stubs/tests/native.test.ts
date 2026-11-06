import { describe, expect, it } from 'vitest'
import {
  createClientOnlyFn,
  createIsomorphicFn,
  createServerOnlyFn,
} from '../src/native'

describe('native runtime fallback', () => {
  it('prefers the client implementation in either registration order', () => {
    const serverFirst = createIsomorphicFn()
      .server(() => 'server')
      .client(() => 'client')
    const clientFirst = createIsomorphicFn()
      .client(() => 'client')
      .server(() => 'server')

    expect(serverFirst()).toBe('client')
    expect(clientFirst()).toBe('client')
  })

  it('does not run a server-only implementation', () => {
    const fn = createIsomorphicFn().server(() => 'server')

    expect(fn()).toBeUndefined()
    expect(() => createServerOnlyFn(() => 'server')()).toThrow(
      'can only be called on the server',
    )
  })

  it('keeps client-only functions callable', () => {
    expect(createClientOnlyFn(() => 'client')()).toBe('client')
  })
})
