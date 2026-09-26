import { describe, expect, test } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'
import type { ParsedHistoryState } from '@tanstack/history'

declare module '@tanstack/history' {
  interface HistoryState {
    sourceArgTest?: string
  }
}

function setup(isServer = false, configuredMask = false) {
  const root = new BaseRootRoute({
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 0),
    }),
  })
  const posts = new BaseRoute({
    getParentRoute: () => root,
    path: '/posts/$id',
  })
  const visible = new BaseRoute({
    getParentRoute: () => root,
    path: '/visible/$id',
  })
  const routeTree = root.addChildren([posts, visible])
  const router = createTestRouter({
    routeTree,
    history: createMemoryHistory({
      initialEntries: ['/posts/latest?page=1#live'],
    }),
    isServer,
    routeMasks: configuredMask
      ? [
          {
            routeTree,
            from: '/posts/$id',
            to: '/visible/$id',
            search: true,
            hash: true,
          },
        ]
      : undefined,
  })
  const source = (id: string, page: number) =>
    router.buildLocation({
      to: '/posts/$id',
      params: { id },
      search: { page },
      hash: id,
      state: { sourceArgTest: id },
    })
  return { router, source }
}

describe.each([false, true])(
  'buildLocation source argument (server: %s)',
  (isServer) => {
    test('reuses frozen options across different sources without retaining inherited values', () => {
      const { router, source } = setup(isServer)
      const options = Object.freeze({
        to: '.',
        params: true,
        search: true,
        hash: true,
      } as const)
      try {
        for (const [id, page] of [
          ['one', 2],
          ['two', 3],
          ['one', 2],
        ] as const) {
          expect(router.buildLocation(options, source(id, page)).href).toBe(
            `/posts/${id}?page=${page}#${id}`,
          )
        }
        expect(options).toEqual({
          to: '.',
          params: true,
          search: true,
          hash: true,
        })
        expect(router.buildLocation(options).href).toBe(
          '/posts/latest?page=1#live',
        )
      } finally {
        router.history.destroy()
      }
    })

    test('preserves explicit option source precedence over the default argument', () => {
      const { router, source } = setup(isServer)
      try {
        const options = Object.freeze({
          to: '.',
          search: true,
          hash: true,
          _fromLocation: source('explicit', 4),
        } as const)
        expect(router.buildLocation(options, source('default', 2)).href).toBe(
          '/posts/explicit?page=4#explicit',
        )
        expect(router.buildLocation(options).href).toBe(
          '/posts/explicit?page=4#explicit',
        )
      } finally {
        router.history.destroy()
      }
    })

    test.each([
      true,
      (state: ParsedHistoryState) => ({
        sourceArgTest: `${state.sourceArgTest}-copied`,
      }),
    ] as const)(
      'inherits state from the separate source while href overrides path/search/hash (%s)',
      (state) => {
        const { router, source } = setup(isServer)
        const options = Object.freeze({
          href: '/visible/fixed?page=9#fixed',
          state,
        })
        try {
          for (const id of ['one', 'two']) {
            const next = router.buildLocation(options, source(id, 2))
            expect(next.href).toBe('/visible/fixed?page=9#fixed')
            expect(next.state).toMatchObject({
              sourceArgTest: state === true ? id : `${id}-copied`,
            })
          }
        } finally {
          router.history.destroy()
        }
      },
    )

    test.each([false, true])(
      'does not pass the destination source into masks (configured: %s)',
      (configuredMask) => {
        const { router, source } = setup(isServer, configuredMask)
        try {
          const options = {
            to: '/posts/$id',
            params: { id: 'target' },
            search: true,
            hash: true,
            ...(configuredMask
              ? {}
              : {
                  mask: {
                    to: '/visible/$id',
                    params: { id: 'target' },
                    search: true,
                    hash: true,
                  } as const,
                }),
          } as const
          const from = source('source', 2)
          const next = router.buildLocation(options, from)
          const legacy = router.buildLocation({
            ...options,
            _fromLocation: from,
          })
          expect(next.href).toBe('/posts/target?page=2#source')
          expect(next.maskedLocation?.href).toBe('/visible/target?page=1#live')
          expect(next).toEqual(legacy)
        } finally {
          router.history.destroy()
        }
      },
    )
  },
)
