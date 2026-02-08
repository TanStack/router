import { describe, expect, test } from 'vitest'
import {
  builtinDefaultSerialize,
  resolveHandler,
  shouldSerialize,
} from '../src/lifecycle'

describe('resolveHandler', () => {
  test('returns undefined for undefined input', () => {
    expect(resolveHandler(undefined)).toBeUndefined()
  })

  test('returns the function for function form', () => {
    const fn = () => 'hello'
    expect(resolveHandler(fn)).toBe(fn)
  })

  test('returns the handler for object form', () => {
    const handler = () => 'hello'
    expect(resolveHandler({ handler })).toBe(handler)
  })

  test('returns the handler for object form with serialize', () => {
    const handler = () => 'hello'
    expect(resolveHandler({ handler, serialize: true })).toBe(handler)
  })

  test('returns the handler for object form with serialize: false', () => {
    const handler = () => 'hello'
    expect(resolveHandler({ handler, serialize: false })).toBe(handler)
  })
})

describe('shouldSerialize', () => {
  // Function form — no method-level serialize, falls to defaults
  test('function form uses router default when available', () => {
    const fn = () => 'hello'
    expect(shouldSerialize(fn, true, false)).toBe(true)
    expect(shouldSerialize(fn, false, true)).toBe(false)
  })

  test('function form uses builtin default when router default is undefined', () => {
    const fn = () => 'hello'
    expect(shouldSerialize(fn, undefined, true)).toBe(true)
    expect(shouldSerialize(fn, undefined, false)).toBe(false)
  })

  // Object form without serialize — falls to defaults
  test('object form without serialize uses router default', () => {
    const option = { handler: () => 'hello' }
    expect(shouldSerialize(option, true, false)).toBe(true)
    expect(shouldSerialize(option, false, true)).toBe(false)
  })

  test('object form without serialize uses builtin default when router default undefined', () => {
    const option = { handler: () => 'hello' }
    expect(shouldSerialize(option, undefined, true)).toBe(true)
    expect(shouldSerialize(option, undefined, false)).toBe(false)
  })

  // Object form with explicit serialize — overrides everything
  test('object form with serialize: true overrides router default false', () => {
    const option = { handler: () => 'hello', serialize: true }
    expect(shouldSerialize(option, false, false)).toBe(true)
  })

  test('object form with serialize: false overrides router default true', () => {
    const option = { handler: () => 'hello', serialize: false }
    expect(shouldSerialize(option, true, true)).toBe(false)
  })

  test('object form with serialize: true overrides builtin default false', () => {
    const option = { handler: () => 'hello', serialize: true }
    expect(shouldSerialize(option, undefined, false)).toBe(true)
  })

  test('object form with serialize: false overrides builtin default true', () => {
    const option = { handler: () => 'hello', serialize: false }
    expect(shouldSerialize(option, undefined, true)).toBe(false)
  })

  // Three-level priority chain
  test('method-level > router default > builtin default', () => {
    // All three present, method-level wins
    expect(
      shouldSerialize({ handler: () => {}, serialize: true }, false, false),
    ).toBe(true)
    expect(
      shouldSerialize({ handler: () => {}, serialize: false }, true, true),
    ).toBe(false)

    // No method-level, router default wins over builtin
    expect(shouldSerialize({ handler: () => {} }, true, false)).toBe(true)
    expect(shouldSerialize({ handler: () => {} }, false, true)).toBe(false)

    // No method-level, no router default, builtin wins
    expect(shouldSerialize({ handler: () => {} }, undefined, true)).toBe(true)
    expect(shouldSerialize({ handler: () => {} }, undefined, false)).toBe(false)
  })
})
