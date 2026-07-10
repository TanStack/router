import { describe, expect, it } from 'vitest'
import { createMemoryHistory } from '@tanstack/history'
import { BaseRootRoute, BaseRoute } from '../src'
import { createTestRouter } from './routerTestUtils'

describe('matchRoute', () => {
  it('matches typed params from routes with custom parse and stringify functions', async () => {
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
      history: createMemoryHistory({ initialEntries: ['/invoices/123'] }),
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
