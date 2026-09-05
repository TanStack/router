import { describe, expect, test } from 'vitest'
import { deriveRouterBasepath, normalizePublicBase } from '../src/planning'

describe('public base URL classification', () => {
  test.each([
    [undefined, '/', ''],
    ['assets', '/assets/', 'assets'],
    ['/assets/', '/assets/', 'assets'],
    [
      '//cdn.example.com/assets/',
      '/cdn.example.com/assets/',
      'cdn.example.com/assets',
    ],
    ['https://cdn.example.com/assets/', 'https://cdn.example.com/assets/', '/'],
    ['https://[::1]/assets/', 'https://[::1]/assets/', '/'],
    ['https://[::1', '/https:/[::1/', 'https:/[::1'],
  ])('normalizes %s', (base, publicBase, routerBasepath) => {
    expect(normalizePublicBase(base)).toBe(publicBase)
    expect(
      deriveRouterBasepath({ configuredBasepath: undefined, publicBase }),
    ).toBe(routerBasepath)
  })

  test('preserves an explicitly configured router basepath', () => {
    expect(
      deriveRouterBasepath({
        configuredBasepath: '/app',
        publicBase: 'https://cdn.example.com/assets/',
      }),
    ).toBe('/app')
  })
})
