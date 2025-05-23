import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { routeOptionsHeadUnexpectedKeysWarning } from '../src/route'

describe('routeOptionsHeadUnexpectedKeysWarning', () => {
  const originalEnv = process.env.NODE_ENV
  const originalWarn = console.warn

  beforeEach(() => {
    console.warn = vi.fn()
  })

  afterEach(() => {
    console.warn = originalWarn
    process.env.NODE_ENV = originalEnv
  })

  it('should not warn when all keys are valid', () => {
    process.env.NODE_ENV = 'development'
    const validResult = {
      links: [],
      scripts: [],
      meta: [],
    }

    routeOptionsHeadUnexpectedKeysWarning(validResult)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('should warn when there are unexpected keys', () => {
    process.env.NODE_ENV = 'development'
    const invalidResult = {
      links: [],
      scripts: [],
      meta: [],
      unexpectedKey: 'value',
    }

    routeOptionsHeadUnexpectedKeysWarning(invalidResult)
    expect(console.warn).toHaveBeenCalledWith(
      'Route head option result has unexpected keys: "unexpectedKey".',
      'Only "links", "scripts", and "meta" are allowed',
    )
  })

  it('should not warn in production environment', () => {
    process.env.NODE_ENV = 'production'
    const invalidResult = {
      links: [],
      scripts: [],
      meta: [],
      unexpectedKey: 'value',
    }

    routeOptionsHeadUnexpectedKeysWarning(invalidResult)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('should not warn when missing expected keys', () => {
    process.env.NODE_ENV = 'development'
    const partialResult = {
      links: [],
      // missing scripts and meta
    }

    routeOptionsHeadUnexpectedKeysWarning(partialResult)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('should warn when all keys are unexpected', () => {
    process.env.NODE_ENV = 'development'
    const allInvalidResult = {
      invalidKey1: 'value1',
      invalidKey2: 'value2',
    } as any

    routeOptionsHeadUnexpectedKeysWarning(allInvalidResult)
    expect(console.warn).toHaveBeenCalledWith(
      'Route head option result has unexpected keys: "invalidKey1", "invalidKey2".',
      'Only "links", "scripts", and "meta" are allowed',
    )
  })
})
