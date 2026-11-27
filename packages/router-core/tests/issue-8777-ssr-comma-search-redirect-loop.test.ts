import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter, loadServerResponse } from './routerTestUtils'

// Arrays are written as `tags=1,2` with a literal comma. Strings are encoded.
const parseSearch = (searchStr: string) => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of new URLSearchParams(searchStr)) {
    result[key] = value
  }
  return result
}
const stringifySearch = (search: Record<string, unknown>) => {
  const parts = Object.entries(search).map(([key, value]) =>
    Array.isArray(value)
      ? `${key}=${value.join(',')}`
      : `${key}=${encodeURIComponent(String(value))}`,
  )
  return parts.length ? `?${parts.join('&')}` : ''
}

function createRouter({
  rewrite = false,
  defaults = false,
  nonIdentity = false,
} = {}) {
  const rootRoute = new BaseRootRoute({})
  const testRoute = new BaseRoute({
    getParentRoute: () => rootRoute,
    path: '/test',
    validateSearch: (search: Record<string, unknown>) => ({
      ...(search.tags === undefined
        ? {}
        : { tags: String(search.tags).split(',') }),
      ...(search.q === undefined ? {} : { q: String(search.q) }),
      ...(defaults ? { page: Number(search.page ?? 1) } : {}),
    }),
  })
  return createTestRouter({
    routeTree: rootRoute.addChildren([testRoute]),
    history: createMemoryHistory({ initialEntries: ['/test'] }),
    isServer: true,
    parseSearch,
    stringifySearch,
    rewrite: rewrite
      ? nonIdentity
        ? {
            input: ({ url }) => {
              url.pathname = url.pathname.replace('/public', '')
              return url
            },
            output: ({ url }) => {
              url.pathname = `/public${url.pathname}`
              return url
            },
          }
        : { input: ({ url }) => url, output: ({ url }) => url }
      : undefined,
  })
}

describe.each([false, true])('rewrite=%s', (rewrite) => {
  test.each(['/test?tags=1,2', '/test?tags=1%2C2', '/test?q=two%20words'])(
    'SSR does not redirect a request to its own canonical URL: %s',
    async (path) => {
      const response = await loadServerResponse(createRouter({ rewrite }), path)

      expect(response.status).toBe(200)
      expect(response.headers.get('Location')).toBeNull()
    },
  )

  test('a real canonical difference still redirects once, then converges', async () => {
    const first = await loadServerResponse(
      createRouter({ rewrite, defaults: true }),
      '/test?tags=1,2',
    )
    const location = first.headers.get('Location')

    expect(first.status).toBe(307)
    expect(location).toBe('/test?tags=1,2&page=1')

    const second = await loadServerResponse(
      createRouter({ rewrite, defaults: true }),
      location!,
    )

    expect(second.status).toBe(200)
    expect(second.headers.get('Location')).toBeNull()
  })
})

test('a non-identity rewrite converges comma-search redirects', async () => {
  const options = { rewrite: true, defaults: true, nonIdentity: true }
  const first = await loadServerResponse(
    createRouter(options),
    '/public/test?tags=1,2',
  )

  expect(first.status).toBe(307)
  expect(first.headers.get('Location')).toBe('/public/test?tags=1,2&page=1')

  const second = await loadServerResponse(
    createRouter(options),
    first.headers.get('Location')!,
  )

  expect(second.status).toBe(200)
  expect(second.headers.get('Location')).toBeNull()
})
