import { createMemoryHistory } from '@tanstack/history'
import { expect, test } from 'vitest'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

const payload = encodeURIComponent(
  '{"__proto__":{"isAdmin":true},"name":"Alice"}',
)

test.each([null, 'value'])(
  'validation preserves a %s __proto__ value and shadowed object methods',
  (value) => {
    const input = {
      ['__proto__']: value,
      hasOwnProperty: false,
      constructor: 'literal',
    }
    const root = new BaseRootRoute({
      validateSearch: (search): Record<string, unknown> =>
        search.filters as Record<string, unknown>,
    })
    const router = createTestRouter({
      routeTree: root,
      history: createMemoryHistory({
        initialEntries: [
          `/?filters=${encodeURIComponent(JSON.stringify(input))}`,
        ],
      }),
    })
    try {
      const { search } = router.buildLocation({ to: '/', search: true })
      expect(search).toEqual({ filters: input, ...input })
    } finally {
      router.history.destroy()
    }
  },
)

test.each(['passthrough', 'expanded JSON'] as const)(
  'building a location preserves %s search data without inheriting flags',
  (mode) => {
    const root = new BaseRootRoute({
      validateSearch: (search): Record<string, unknown> =>
        mode === 'passthrough'
          ? search
          : (search.filters as Record<string, unknown>),
    })
    const router = createTestRouter({
      routeTree: root,
      history: createMemoryHistory({
        initialEntries: [
          mode === 'passthrough'
            ? '/?name=Alice&__proto__=%7B%22isAdmin%22%3Atrue%7D'
            : `/?filters=${payload}`,
        ],
      }),
    })

    try {
      const location = router.buildLocation({
        to: '/',
        search: (search: Record<string, unknown>) => ({
          name: search.name,
          access: search.isAdmin ? 'admin' : 'visitor',
          details: search.__proto__,
        }),
      })

      expect(location.search).toEqual({
        name: 'Alice',
        access: 'visitor',
        details: { isAdmin: true },
      })
    } finally {
      router.history.destroy()
    }
  },
)

test('strict search navigation does not give the search updater inherited flags', async () => {
  const root = new BaseRootRoute({
    validateSearch: (search): Record<string, unknown> => search,
  })
  const index = new BaseRoute({ getParentRoute: () => root, path: '/' })
  const router = createTestRouter({
    routeTree: root.addChildren([index]),
    search: { strict: true },
    history: createMemoryHistory({
      initialEntries: ['/?name=Alice&__proto__=%7B%22isAdmin%22%3Atrue%7D'],
    }),
  })

  try {
    await router.load()
    await router.navigate({
      to: '/',
      search: (search: Record<string, unknown>) => ({
        name: search.name,
        access: search.isAdmin ? 'admin' : 'visitor',
        details: search.__proto__,
      }),
    })

    expect(router.state.location.search).toEqual({
      name: 'Alice',
      access: 'visitor',
      details: { isAdmin: true },
    })
  } finally {
    router.history.destroy()
  }
})

test('location building respects search fields removed by a validator', () => {
  const root = new BaseRootRoute({
    validateSearch: (search): Record<string, unknown> => {
      delete search.debug
      return { name: 'Alice' }
    },
  })
  const router = createTestRouter({
    routeTree: root,
    history: createMemoryHistory({ initialEntries: ['/?debug=true'] }),
  })
  try {
    expect(router.buildLocation({ to: '/', search: true }).search).toEqual({
      name: 'Alice',
    })
  } finally {
    router.history.destroy()
  }
})

test('child validation reads safe parent search and overrides only its own fields', () => {
  const root = new BaseRootRoute({
    validateSearch: (search): Record<string, unknown> =>
      search.filters as Record<string, unknown>,
  })
  const child = new BaseRoute({
    getParentRoute: () => root,
    path: '/',
    validateSearch: (search): Record<string, unknown> => ({
      access: search.isAdmin ? 'admin' : 'visitor',
      name: 'Bob',
    }),
  })
  const router = createTestRouter({
    routeTree: root.addChildren([child]),
    history: createMemoryHistory({ initialEntries: [`/?filters=${payload}`] }),
  })
  try {
    const { search } = router.buildLocation({ to: '/', search: true })
    const input = JSON.parse(decodeURIComponent(payload))
    expect(search).toEqual({
      filters: input,
      ...input,
      name: 'Bob',
      access: 'visitor',
    })
  } finally {
    router.history.destroy()
  }
})
