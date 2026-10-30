import { describe, expect, test } from 'vitest'
import {
  deriveRouterBasepath,
  isRelativePublicBase,
  normalizePublicBase,
  shouldRewriteDevBasepath,
} from '../src/planning'

describe('normalizePublicBase', () => {
  test('defaults to the root base', () => {
    expect(normalizePublicBase(undefined)).toBe('/')
    expect(normalizePublicBase('/')).toBe('/')
  })

  test('wraps a path base in slashes', () => {
    expect(normalizePublicBase('app')).toBe('/app/')
    expect(normalizePublicBase('/app')).toBe('/app/')
    expect(normalizePublicBase('/app/')).toBe('/app/')
  })

  test('keeps an absolute URL base untouched', () => {
    expect(normalizePublicBase('https://cdn.example.com/assets/')).toBe(
      'https://cdn.example.com/assets/',
    )
  })

  test('keeps a relative base relative instead of rewriting it to /./', () => {
    expect(normalizePublicBase('.')).toBe('.')
    expect(normalizePublicBase('./')).toBe('./')
  })
})

describe('isRelativePublicBase', () => {
  test('only matches the dot forms', () => {
    expect(isRelativePublicBase('.')).toBe(true)
    expect(isRelativePublicBase('./')).toBe(true)
    expect(isRelativePublicBase('/')).toBe(false)
    expect(isRelativePublicBase('/app/')).toBe(false)
    expect(isRelativePublicBase('./app/')).toBe(false)
  })
})

describe('deriveRouterBasepath', () => {
  test('prefers an explicitly configured basepath', () => {
    expect(
      deriveRouterBasepath({ configuredBasepath: '/custom', publicBase: './' }),
    ).toBe('/custom')
  })

  test('derives the basepath from a path public base', () => {
    expect(
      deriveRouterBasepath({
        configuredBasepath: undefined,
        publicBase: '/app/',
      }),
    ).toBe('app')
  })

  test('falls back to the root for an absolute URL public base', () => {
    expect(
      deriveRouterBasepath({
        configuredBasepath: undefined,
        publicBase: 'https://cdn.example.com/assets/',
      }),
    ).toBe('/')
  })

  test('falls back to the root for a relative public base', () => {
    expect(
      deriveRouterBasepath({ configuredBasepath: undefined, publicBase: './' }),
    ).toBe('/')
    expect(
      deriveRouterBasepath({ configuredBasepath: undefined, publicBase: '.' }),
    ).toBe('/')
  })
})

describe('shouldRewriteDevBasepath', () => {
  test('rewrites when the router basepath and a path public base diverge', () => {
    expect(
      shouldRewriteDevBasepath({
        command: 'serve',
        middlewareMode: false,
        routerBasepath: '/',
        publicBase: '/_ui/',
      }),
    ).toBe(true)
  })

  test('does not rewrite for a relative public base', () => {
    expect(
      shouldRewriteDevBasepath({
        command: 'serve',
        middlewareMode: false,
        routerBasepath: '/',
        publicBase: './',
      }),
    ).toBe(false)
  })
})
