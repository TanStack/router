import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('matchRoute', () => {
  function createInvoiceRouter(initialEntry = '/invoices/123') {
    const rootRoute = new BaseRootRoute({})
    const invoiceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/invoices/$invoiceId',
      params: {
        parse: ({ invoiceId }: { invoiceId: string }) => {
          const parsed = Number(invoiceId)
          return Number.isInteger(parsed) ? { invoiceId: parsed } : false
        },
        stringify: ({ invoiceId }: { invoiceId: number }) => ({
          invoiceId: String(invoiceId),
        }),
      },
    })

    return createTestRouter({
      routeTree: rootRoute.addChildren([invoiceRoute]),
      history: createMemoryHistory({ initialEntries: [initialEntry] }),
    })
  }

  it('matches typed params from routes with custom parse and stringify functions', async () => {
    const router = createInvoiceRouter()

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
      }),
    ).toEqual({ invoiceId: 123 })
  })

  it('does not match a different typed param', async () => {
    const router = createInvoiceRouter()

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 456 },
      }),
    ).toBe(false)
  })

  it('does not match a lower-priority route', async () => {
    const rootRoute = new BaseRootRoute({})
    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/$postId',
      params: {
        parse: ({ postId }: { postId: string }) => ({ postId }),
      },
    })
    const editRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/edit',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postRoute, editRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts/edit'] }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/posts/$postId',
        params: { postId: 'edit' },
      }),
    ).toBe(false)
  })

  it('does not match params rejected by the route parser', async () => {
    const router = createInvoiceRouter('/invoices/not-a-number')

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
      }),
    ).toBe(false)
  })

  it('returns parsed params on repeated calls without rerunning the parser', async () => {
    const parse = vi.fn(({ invoiceId }: { invoiceId: string }) => ({
      invoiceId: Number(invoiceId),
    }))
    const rootRoute = new BaseRootRoute({})
    const invoiceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/invoices/$invoiceId',
      params: { parse },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([invoiceRoute]),
      history: createMemoryHistory({ initialEntries: ['/invoices/123'] }),
    })

    await router.load()
    parse.mockClear()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
      }),
    ).toEqual({ invoiceId: 123 })
    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
      }),
    ).toEqual({ invoiceId: 123 })
    expect(parse).toHaveBeenCalledOnce()
    expect(parse).toHaveBeenCalledWith({ invoiceId: '123' })
  })

  it('does not throw parser errors while checking a match', async () => {
    const rootRoute = new BaseRootRoute({})
    const invoiceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/invoices/$invoiceId',
      params: {
        parse: () => {
          throw new Error('invalid invoice')
        },
        stringify: ({ invoiceId }: { invoiceId: number }) => ({
          invoiceId: String(invoiceId),
        }),
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([invoiceRoute]),
      history: createMemoryHistory({ initialEntries: ['/invoices/123'] }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
      }),
    ).toBe(false)
  })

  it('matches an internal ID parsed from a non-canonical public slug', async () => {
    const rootRoute = new BaseRootRoute({})
    const thingRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/things/$thingId',
      params: {
        parse: ({ thingId }: { thingId: string }) => ({
          thingId: thingId.slice(thingId.lastIndexOf('-') + 1),
        }),
        stringify: ({ thingId }: { thingId: string }) => ({
          thingId,
        }),
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([thingRoute]),
      history: createMemoryHistory({
        initialEntries: ['/things/Title-of-the-thing-abc123'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/things/$thingId',
        params: { thingId: 'abc123' },
      }),
    ).toEqual({ thingId: 'abc123' })
  })

  it('passes parsed parent params to child route parsers', async () => {
    const rootRoute = new BaseRootRoute({})
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      params: {
        parse: ({ orgId }: { orgId: string }) => ({
          orgId: Number(orgId),
        }),
      },
    })
    const projectRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/projects/$projectId',
      params: {
        parse: (params: { projectId: string }) => {
          if (typeof (params as Record<string, unknown>).orgId !== 'number') {
            return false
          }
          return { projectId: Number(params.projectId) }
        },
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([orgRoute.addChildren([projectRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/orgs/42/projects/7'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/orgs/$orgId/projects/$projectId',
        params: { orgId: 42, projectId: 7 },
      }),
    ).toEqual({ orgId: 42, projectId: 7 })
  })

  it.each([{ to: '/invoices/$id', params: { id: '123' } }, { to: '/missing' }])(
    'does not match an unregistered destination',
    async (location) => {
      const router = createInvoiceRouter()

      await router.load()

      expect(router.matchRoute(location as any)).toBe(false)
    },
  )

  it('only matches an active ancestor when fuzzy matching', async () => {
    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
    })
    const postRoute = new BaseRoute({
      getParentRoute: () => postsRoute,
      path: '/$postId',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postsRoute.addChildren([postRoute])]),
      history: createMemoryHistory({ initialEntries: ['/posts/123'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/posts' })).toBe(false)
    expect(router.matchRoute({ to: '/posts' }, { fuzzy: true })).toEqual({
      '**': '123',
    })
  })

  it('matches the root route without an index child', async () => {
    const rootRoute = new BaseRootRoute({})
    const router = createTestRouter({
      routeTree: rootRoute,
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/' })).toEqual({})
  })

  it('does not match a root index route rejected by its parser', async () => {
    const rootRoute = new BaseRootRoute({})
    const indexRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      params: {
        parse: () => false,
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([indexRoute]),
      history: createMemoryHistory({ initialEntries: ['/'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/' })).toBe(false)
  })

  it('matches encoded params without corrupting fuzzy remainders', async () => {
    const rootRoute = new BaseRootRoute({})
    const itemRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/items/$itemId',
    })
    const exactRouter = createTestRouter({
      routeTree: rootRoute.addChildren([itemRoute]),
      history: createMemoryHistory({
        initialEntries: ['/items/hello%20world'],
      }),
    })

    await exactRouter.load()

    expect(
      exactRouter.matchRoute(
        {
          to: '/items/$itemId',
          params: { itemId: 'hello world' },
        },
        { caseSensitive: true },
      ),
    ).toEqual({ itemId: 'hello world' })

    const fuzzyRouter = createTestRouter({
      routeTree: rootRoute.addChildren([itemRoute]),
      history: createMemoryHistory({
        initialEntries: ['/items/hello%20world/details'],
      }),
    })

    await fuzzyRouter.load()

    expect(
      fuzzyRouter.matchRoute(
        {
          to: '/items/$itemId',
          params: { itemId: 'hello world' },
        },
        { fuzzy: true },
      ),
    ).toEqual({ itemId: 'hello world', '**': 'details' })
  })

  it('keeps ancestor params when a descendant reuses the param name', async () => {
    const rootRoute = new BaseRootRoute({})
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$id',
    })
    const projectRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/projects/$id',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([orgRoute.addChildren([projectRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/orgs/one/projects/two'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute(
        { to: '/orgs/$id', params: { id: 'one' } },
        { fuzzy: true },
      ),
    ).toEqual({ id: 'one', '**': 'projects/two' })
  })

  it('returns parsed ancestor params when fuzzy matching', async () => {
    const rootRoute = new BaseRootRoute({})
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      params: {
        parse: ({ orgId }: { orgId: string }) => ({ orgId: Number(orgId) }),
      },
    })
    const projectRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/projects/$projectId',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([orgRoute.addChildren([projectRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/orgs/42/projects/7'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute(
        { to: '/orgs/$orgId', params: { orgId: 42 } },
        { fuzzy: true },
      ),
    ).toEqual({ orgId: 42, '**': 'projects/7' })
  })

  it('keeps a reused child param value on exact matches', async () => {
    const rootRoute = new BaseRootRoute({})
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$id',
      params: {
        parse: ({ id }: { id: string }) => ({ id: `parent:${id}` }),
      },
    })
    const projectRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/projects/$id',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([orgRoute.addChildren([projectRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/orgs/one/projects/two'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/orgs/$id/projects/$id',
        params: { id: 'two' },
      }),
    ).toEqual({ id: 'two' })
  })

  it('passes a reused child param name to the child parser', async () => {
    const childParse = vi.fn(({ id }: { id: string }) => ({
      id: `child:${id}`,
    }))
    const rootRoute = new BaseRootRoute({})
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$id',
      params: {
        parse: ({ id }: { id: string }) => ({ id: `parent:${id}` }),
      },
    })
    const projectRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      path: '/projects/$id',
      params: { parse: childParse },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([orgRoute.addChildren([projectRoute])]),
      history: createMemoryHistory({
        initialEntries: ['/orgs/one/projects/two'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/orgs/$id/projects/$id',
        params: { id: 'child:two' },
      }),
    ).toEqual({ id: 'child:two' })
    expect(childParse).toHaveBeenCalledWith({ id: 'two' })
  })

  it('returns parsed optional params', async () => {
    const rootRoute = new BaseRootRoute({})
    const postRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts/{-$postId}',
      params: {
        parse: ({ postId }: { postId?: string }) => ({
          postId: postId ? Number(postId) : undefined,
        }),
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts/42'] }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/posts/{-$postId}',
        params: { postId: 42 },
      }),
    ).toEqual({ postId: 42 })
  })

  it('returns wildcard params', async () => {
    const rootRoute = new BaseRootRoute({})
    const filesRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/files/$',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([filesRoute]),
      history: createMemoryHistory({ initialEntries: ['/files/a/b'] }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/files/$',
        params: { _splat: 'a/b' },
      }),
    ).toEqual({ '*': 'a/b', _splat: 'a/b' })
  })

  it('passes parsed params through pathless route parsers', async () => {
    const rootRoute = new BaseRootRoute({})
    const orgRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/orgs/$orgId',
      params: {
        parse: ({ orgId }: { orgId: string }) => ({ orgId: Number(orgId) }),
      },
    })
    const layoutRoute = new BaseRoute({
      getParentRoute: () => orgRoute,
      id: '/_layout',
      params: {
        parse: (params: Record<string, unknown>) => {
          if (typeof params.orgId !== 'number') {
            return false
          }
          return { organizationId: params.orgId }
        },
      },
    })
    const projectRoute = new BaseRoute({
      getParentRoute: () => layoutRoute,
      path: '/projects',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        orgRoute.addChildren([layoutRoute.addChildren([projectRoute])]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/orgs/42/projects'] }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/orgs/$orgId/projects',
        params: { orgId: 42, organizationId: 42 },
      }),
    ).toEqual({ orgId: 42, organizationId: 42 })
  })

  it('returns false for a malformed fuzzy remainder', async () => {
    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/posts',
    })
    const malformedRoute = new BaseRoute({
      getParentRoute: () => postsRoute,
      path: '/%ZZ',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        postsRoute.addChildren([malformedRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/posts/%ZZ'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/posts' }, { fuzzy: true })).toBe(false)
  })

  it('fuzzy matches a layout route that has an index child', async () => {
    const rootRoute = new BaseRootRoute({})
    const dashboardRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/dashboard',
    })
    const dashboardIndexRoute = new BaseRoute({
      getParentRoute: () => dashboardRoute,
      path: '/',
    })
    const detailsRoute = new BaseRoute({
      getParentRoute: () => dashboardRoute,
      path: '/details',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([
        dashboardRoute.addChildren([dashboardIndexRoute, detailsRoute]),
      ]),
      history: createMemoryHistory({ initialEntries: ['/dashboard/details'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/dashboard' }, { fuzzy: true })).toEqual({
      '**': 'details',
    })
  })

  it('respects the caseSensitive matching option', async () => {
    const rootRoute = new BaseRootRoute({})
    const postsRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/Posts',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([postsRoute]),
      history: createMemoryHistory({ initialEntries: ['/posts'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/Posts' })).toEqual({})
    expect(router.matchRoute({ to: '/Posts' }, { caseSensitive: true })).toBe(
      false,
    )
  })

  it('checks case sensitivity against the selected sibling route', async () => {
    const rootRoute = new BaseRootRoute({})
    const upperRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/Foo/a',
    })
    const lowerRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/foo/b',
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([upperRoute, lowerRoute]),
      history: createMemoryHistory({ initialEntries: ['/FOO/b'] }),
    })

    await router.load()

    expect(router.matchRoute({ to: '/foo/b' })).toEqual({})
    expect(router.matchRoute({ to: '/foo/b' }, { caseSensitive: true })).toBe(
      false,
    )
  })

  it('keeps fuzzy matching behavior with string params', async () => {
    const router = createInvoiceRouter('/invoices/123/details')

    await router.load()

    expect(
      router.matchRoute(
        {
          to: '/invoices/$invoiceId',
          params: { invoiceId: 123 },
        },
        { fuzzy: true },
      ),
    ).toEqual({ invoiceId: 123, '**': 'details' })
  })

  it('keeps search matching behavior', async () => {
    const router = createInvoiceRouter('/invoices/123?tab=details')

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
        search: { tab: 'details' },
      }),
    ).toEqual({ invoiceId: 123 })
    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
        search: { tab: 'other' },
      }),
    ).toBe(false)
  })

  it('matches typed params with a router basepath', async () => {
    const rootRoute = new BaseRootRoute({})
    const invoiceRoute = new BaseRoute({
      getParentRoute: () => rootRoute,
      path: '/invoices/$invoiceId',
      params: {
        parse: ({ invoiceId }: { invoiceId: string }) => ({
          invoiceId: Number(invoiceId),
        }),
        stringify: ({ invoiceId }: { invoiceId: number }) => ({
          invoiceId: String(invoiceId),
        }),
      },
    })
    const router = createTestRouter({
      routeTree: rootRoute.addChildren([invoiceRoute]),
      basepath: '/app',
      history: createMemoryHistory({
        initialEntries: ['/app/invoices/123'],
      }),
    })

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$invoiceId',
        params: { invoiceId: 123 },
      }),
    ).toEqual({ invoiceId: 123 })
  })

  it.each(['never', 'always', 'preserve'] as const)(
    'matches a trailing slash with the %s policy',
    async (trailingSlash) => {
      const rootRoute = new BaseRootRoute({})
      const postsRoute = new BaseRoute({
        getParentRoute: () => rootRoute,
        path: '/posts',
      })
      const router = createTestRouter({
        routeTree: rootRoute.addChildren([postsRoute]),
        trailingSlash,
        history: createMemoryHistory({ initialEntries: ['/posts/'] }),
      })

      await router.load()

      expect(router.matchRoute({ to: '/posts' })).toEqual({})
    },
  )
})
