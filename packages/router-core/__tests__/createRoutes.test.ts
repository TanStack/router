import { Route } from '../src'
import { z } from 'zod'
import {
  createRouter,
  AllRouteInfo,
  createRouteConfig,
  RelativeToPathAutoComplete,
} from '../src'

// Write a test
describe('everything', () => {
  it('should work', () => {
    // Build our routes. We could do this in our component, too.
    const routeConfig = createRouteConfig().createChildren((createRoute) => [
      createRoute({
        path: '/',
        validateSearch: (search) =>
          z
            .object({
              version: z.number(),
            })
            .parse(search),
      }),
      createRoute({
        path: '/test',
        validateSearch: (search) =>
          z
            .object({
              version: z.number(),
              isGood: z.boolean(),
            })
            .parse(search),
      }),
      createRoute({
        path: 'dashboard',
        loader: async () => {
          console.log('Fetching all invoices...')
          return {
            invoices: 'await fetchInvoices()',
          }
        },
      }).createChildren((createRoute) => [
        createRoute({ path: '/' }),
        createRoute({
          path: 'invoices',
        }).createChildren((createRoute) => [
          createRoute({
            path: '/',
            action: async (partialInvoice: { amount: number }) => {
              const invoice: { id: number; amount: number } = null!
              // // Redirect to the new invoice
              // ctx.router.navigate({
              //   to: invoice.id,
              //   // Use the current match for relative paths
              //   from: ctx.match.pathname,
              // })
              return invoice
            },
          }),
          createRoute({
            path: ':invoiceId',
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
          }),
        ]),
        createRoute({
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
        }).createChildren((createRoute) => [
          createRoute({
            path: ':userId',
            loader: async ({ params: { userId }, search }) => {
              return {
                user: 'await fetchUserById(userId!)',
              }
            },
            action: async (partialUser: { amount: number }) => {
              const invoice: { id: number; amount: number } = null!
              // // Redirect to the new invoice
              // ctx.router.navigate({
              //   to: invoice.id,
              //   // Use the current match for relative paths
              //   from: ctx.match.pathname,
              // })
              return invoice
            },
          }),
        ]),
      ]),
      // Obviously, you can put routes in other files, too
      // reallyExpensiveRoute,
      createRoute({
        path: 'authenticated/', // Trailing slash doesn't mean anything
      }).createChildren((createRoute) => [
        createRoute({
          path: '/',
        }),
      ]),
      createRoute({
        id: 'layout',
        component: () => 'layout-wrapper',
        validateSearch: (search) =>
          z
            .object({
              isLayout: z.boolean(),
            })
            .parse(search),
      }).createChildren((createRoute) => [
        createRoute({
          path: 'layout-a',
          component: () => 'layout-a',
        }),
        createRoute({
          path: 'layout-b',
          component: () => 'layout-b',
        }),
      ]),
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
    type InvoiceRouteInfo = RoutesById['/dashboard/invoices/']
    //   ^?
    type InvoiceLoaderData = InvoiceRouteInfo['loaderData']
    //   ^?//
    type InvoiceAction = InvoiceRouteInfo['actionPayload']
    //   ^?

    const router = createRouter({
      routeConfig,
    })

    const loaderData = router.getRoute('/dashboard/users/:userId')
    //    ^?
    const route = router.getRoute('/dashboard/users/:userId')
    //    ^?
    const action = route.action
    //    ^?
    const result = action.submit({ amount: 10000 })
    //    ^?

    router.buildLink({
      to: '/dashboard/users/:userId',
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

    route.buildLink({
      to: '',
    })

    router.getRoute('/dashboard').buildLink({
      to: '/dashboard/invoices',
      params: {
        // @ts-expect-error
        invoiceId: 2,
      },
    })

    router.getRoute('/dashboard').buildLink({
      to: '/dashboard/invoices/:invoiceId',
      params: {
        // @ts-expect-error
        invoiceId: '2',
      },
    })

    router.getRoute('/').buildLink({
      to: '/dashboard/invoices/:invoiceId',
      params: {
        invoiceId: 2,
      },
    })

    router.getRoute('/').buildLink({
      to: '/',
      search: {
        version: 2,
      },
    })

    router.getRoute('/').buildLink({
      to: '/dashboard/users/:userId',
      params: (current) => ({
        userId:
          // @ts-expect-error
          current?.invoiceId,
      }),
      search: (old) => ({
        usersView: {
          sortBy: 'email' as const,
          filterBy: String(old.version),
        },
      }),
    })

    router.getRoute('/dashboard/invoices/:invoiceId').buildLink({
      to: '/dashboard/users/:userId',
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

    router.getRoute('/dashboard/users/:userId').buildLink({
      to: '/',
      search: (prev) => {
        return {
          version: 2,
        }
      },
    })

    router.buildLink({
      from: '/',
      to: '/dashboard/users/:userId',
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

    router.getRoute('/').navigate({
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

    router.getRoute('/').buildLink({
      to: '/dashboard/invoices/:invoiceId',
      params: {
        invoiceId: 2,
      },
    })

    router.getRoute('/dashboard/invoices/:invoiceId').buildLink({
      to: '.',
      params: (d) => ({
        invoiceId: d.invoiceId,
      }),
    })

    router.getRoute('/dashboard/invoices/:invoiceId').buildLink({
      to: '../test',
      search: {
        version: 2,
        isGood: true,
      },
    })

    router.getRoute('/').buildLink({
      to: '/layout-a',
      search: (current) => ({
        isLayout: !!current.version,
      }),
    })
  })
})
