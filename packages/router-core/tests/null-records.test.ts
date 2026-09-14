import { describe, expect, test, vi } from 'vitest'
import { createNull } from '../src/utils'

const environment = vi.hoisted(() => ({ server: false }))
vi.mock('@tanstack/router-core/isServer', () => ({
  get isServer() {
    return environment.server
  },
}))

describe.each([false, true])('null records (server: %s)', (server) => {
  test('returns fresh extensible records without inherited properties', () => {
    environment.server = server
    const first = createNull()
    const second = createNull()
    expect(Object.getPrototypeOf(first)).toBeNull()
    expect(Reflect.ownKeys(first)).toEqual([])
    expect(Object.isExtensible(first)).toBe(true)
    expect(first).not.toBe(second)
    expect('constructor' in first).toBe(false)
    expect('__proto__' in first).toBe(false)
  })

  test('copies special keys and symbols without invoking prototype setters', () => {
    environment.server = server
    const symbol = Symbol('param')
    const source = JSON.parse(
      '{"__proto__":{"polluted":true},"constructor":"value","id":"item"}',
    )
    source[symbol] = 'symbol value'
    const result = Object.assign(createNull(), source)
    expect(Object.getPrototypeOf(result)).toBeNull()
    expect(Reflect.ownKeys(result)).toEqual(Reflect.ownKeys(source))
    expect(Object.getOwnPropertyDescriptors(result)).toEqual(
      Object.getOwnPropertyDescriptors(source),
    )
    expect(result.polluted).toBeUndefined()
  })
})
