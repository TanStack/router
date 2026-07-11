import { describe, expect, it } from 'vitest'
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

  it('keeps generic route templates working with string params', async () => {
    const router = createInvoiceRouter()

    await router.load()

    expect(
      router.matchRoute({
        to: '/invoices/$id',
        params: { id: '123' },
      } as any),
    ).toEqual({ id: '123' })
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
})
