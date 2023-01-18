import { describe, it } from 'vitest'
import { Route } from '../src'
import { z } from 'zod'
import { Router, AllRouteInfo, createRouteConfig } from '../src'

// Write a test
describe('everything', () => {
  it('should work', () => {
    // Build our routes. We could do this in our component, too.
    const rootRoute = createRouteConfig()
    const indexRoute = rootRoute.createRoute({
      path: '/',
      validateSearch: (search) =>
        z
          .object({
            version: z.number(),
          })
          .parse(search),
    })
    const testRoute = rootRoute.createRoute({
      path: 'test',
      validateSearch: (search) =>
        z
          .object({
            version: z.number(),
            isGood: z.boolean(),
          })
          .parse(search),
    })
    const dashboardRoute = rootRoute.createRoute({
      path: 'dashboard',
      loader: async () => {
        console.log('Fetching all invoices...')
        return {
          invoices: 'await fetchInvoices()',
        }
      },
    })
    const dashboardIndexRoute = dashboardRoute.createRoute({ path: '/' })
    const invoicesRoute = dashboardRoute.createRoute({
      path: 'invoices',
    })
    const invoicesIndexRoute = invoicesRoute.createRoute({
      path: '/',
    })
    const invoiceRoute = invoicesRoute.createRoute({
      path: '$invoiceId',
      parseParams: ({ invoiceId }) => ({ invoiceId: Number(invoiceId) }),
      stringifyParams: ({ invoiceId }) => ({
        invoiceId: String(invoiceId),
      }),
      loader: async ({ params: { invoiceId } }) => {
        console.log('Fetching invoice...')
        return {
          invoice: 'await fetchInvoiceById(invoiceId!)',
        }
      },
    })
    const usersRoute = dashboardRoute.createRoute({
      path: 'users',
      loader: async () => {
        return {
          users: 'await fetchUsers()',
        }
      },
      validateSearch: (search) =>
        z
          .object({
            usersView: z
              .object({
                sortBy: z.enum(['name', 'id', 'email']).optional(),
                filterBy: z.string().optional(),
              })
              .optional(),
          })
          .parse(search),
      preSearchFilters: [
        // Keep the usersView search param around
        // while in this route (or it's children!)
        (search) => ({
          ...search,
          usersView: {
            ...search.usersView,
          },
        }),
      ],
    })
    const userRoute = usersRoute.createRoute({
      path: '$userId',
      loader: async ({ params: { userId }, search }) => {
        return {
          user: 'await fetchUserById(userId!)',
        }
      },
    })
    const authenticatedRoute = rootRoute.createRoute({
      path: 'authenticated/', // Trailing slash doesn't mean anything
    })
    const authenticatedIndexRoute = authenticatedRoute.createRoute({
      path: '/',
    })
    const layoutRoute = rootRoute.createRoute({
      id: 'layout',
      component: () => 'layout-wrapper',
      validateSearch: (search) =>
        z
          .object({
            isLayout: z.boolean(),
          })
          .parse(search),
    })
    const layoutARoute = layoutRoute.createRoute({
      path: 'layout-a',
      component: () => 'layout-a',
    })
    const layoutBRoute = layoutRoute.createRoute({
      path: 'layout-b',
      component: () => 'layout-b',
    })

    const routeConfig = rootRoute.addChildren([
      indexRoute,
      testRoute,
      dashboardRoute.addChildren([
        dashboardIndexRoute,
        invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
        usersRoute.addChildren([userRoute]),
      ]),
      authenticatedRoute.addChildren([authenticatedIndexRoute]),
      layoutRoute.addChildren([layoutARoute, layoutBRoute]),
    ])

    type MyRoutesInfo = AllRouteInfo<typeof routeConfig>
    //   ^?
    type RouteInfo = MyRoutesInfo['routeInfo']
    type RoutesById = MyRoutesInfo['routeInfoById']
    type RoutesTest = Route<
      MyRoutesInfo,
      MyRoutesInfo['routeInfoByFullPath']['/']
    >
    //   ^?
    type RoutePaths = MyRoutesInfo['routeInfoByFullPath']
    //   ^?
    type InvoiceRouteInfo = RoutesById['/dashboard/invoices/$invoiceId']
    //   ^?
    type InvoiceLoaderData = InvoiceRouteInfo['loaderData']
    //   ^?//

    const router = new Router({
      routeConfig,
    })

    const loaderData = router.getRoute('/dashboard/users/$userId')
    //    ^?
    const route = router.getRoute('/dashboard/users/$userId')
    //    ^?

    router.buildLink({
      to: '/dashboard/users/$userId',
      params: {
        userId: '2',
      },
      search: (prev) => ({
        usersView: {
          sortBy: 'email',
        },
      }),
    })

    // @ts-expect-error
    router.buildLink({
      from: '/',
      to: '/test',
    })

    router.buildLink({
      from: '/',
      to: '/test',
      search: () => {
        return {
          version: 2,
          isGood: true,
        }
      },
    })

    router.buildLink({
      from: '/test',
      to: '/',
    })

    router.buildLink({
      from: route.id,
      to: '',
    })

    router.buildLink({
      from: '/dashboard',
      to: '/dashboard/invoices',
      params: {
        invoiceId: 2,
      },
    })

    router.buildLink({
      from: '/dashboard',
      to: '/dashboard/invoices/$invoiceId',
      params: {
        // @ts-expect-error
        invoiceId: '2',
      },
    })

    router.buildLink({
      to: '/dashboard/invoices/$invoiceId',
      params: {
        invoiceId: 2,
      },
    })

    router.buildLink({
      to: '/',
      search: {
        version: 2,
      },
    })

    router.buildLink({
      to: '/dashboard/users/$userId',
      // @ts-expect-error
      params: (current) => ({
        userId: current?.invoiceId,
      }),
      search: (old) => ({
        usersView: {
          sortBy: 'email' as const,
          filterBy: String(old.version),
        },
      }),
    })

    router.buildLink({
      from: '/dashboard/invoices/$invoiceId',
      to: '/dashboard/users/$userId',
      params: (current) => ({
        userId: `${current?.invoiceId}`,
      }),
      search: (prev) => {
        return {
          usersView: {
            sortBy: 'name' as const,
            filterBy: 'tanner',
          },
        }
      },
    })

    router.buildLink({
      from: '/dashboard/users/$userId',
      to: '/',
      search: (prev) => {
        return {
          version: 2,
        }
      },
    })

    router.buildLink({
      from: '/',
      to: '/dashboard/users/$userId',
      params: {
        userId: '2',
      },
      search: (prev) => ({
        usersView: {
          sortBy: 'id',
          filterBy: `${prev.version}`,
        },
      }),
    })

    router.navigate({
      search: (prev: any) => ({
        version: prev.version,
      }),
    })

    router.buildLink({
      from: '/dashboard/invoices',
      to: '/dashboard',
    })

    // @ts-expect-error
    router.buildLink({
      from: '/',
      to: '/does-not-exist',
    })

    router.buildLink({
      to: '/dashboard/invoices/$invoiceId',
      params: {
        invoiceId: 2,
      },
    })

    router.buildLink({
      from: '/dashboard/invoices/$invoiceId',
      to: '.',
      params: (d) => ({
        invoiceId: d.invoiceId,
      }),
    })

    router.buildLink({
      from: '/dashboard/invoices/$invoiceId',
      to: testRoute.id,
      search: {
        version: 2,
        isGood: true,
      },
    })

    router.buildLink({
      to: '/layout-a',
      search: (current) => ({
        isLayout: !!current.version,
      }),
    })
  })
})
