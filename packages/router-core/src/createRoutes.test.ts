import { AnyAllRouteInfo, Route } from '@tanstack/router-core'
import * as React from 'react'
import { z } from 'zod'
import { createRoutes, Router, AnyRouteDef, AllRouteInfo } from '.'

// Build our routes. We could do this in our component, too.
const routes = createRoutes().addChildren((createRoute) => [
  createRoute({
    path: '/',
    validateSearch: z.object({
      version: z.number(),
    }).parse,
  }),
  createRoute({
    path: '/test',
    validateSearch: z.object({
      version: z.number(),
      isGood: z.boolean(),
    }).parse,
  }),
  createRoute({
    path: 'dashboard',
    loader: async () => {
      console.log('Fetching all invoices...')
      return {
        invoices: 'await fetchInvoices()',
      }
    },
  }).addChildren((createRoute) => [
    createRoute({ path: '/' }),
    createRoute({
      path: 'invoices',
    }).addChildren((createRoute) => [
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
        stringifyParams: ({ invoiceId }) => ({ invoiceId: String(invoiceId) }),
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
      validateSearch: z.object({
        usersView: z
          .object({
            sortBy: z.enum(['name', 'id', 'email']).optional(),
            filterBy: z.string().optional(),
          })
          .optional(),
      }).parse,
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
    }).addChildren((createRoute) => [
      createRoute({
        path: ':userId',
        loader: async ({ params: { userId } }) => {
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
  }).addChildren((createRoute) => [
    createRoute({
      path: '/',
    }),
  ]),
])

type MyRoutesInfo = AllRouteInfo<typeof routes>
//   ^?
type RouteInfo = MyRoutesInfo['routeInfo']
type RoutesById = MyRoutesInfo['routeInfoById']
type RoutesTest = Route<
  MyRoutesInfo,
  MyRoutesInfo['routeInfoByFullPath']['/dashboard/invoices']
>
//   ^?
type RoutePaths = MyRoutesInfo['routeInfoByFullPath']
//   ^?
type InvoiceRouteInfo = RoutesById['/dashboard/invoices/']
//   ^?
type InvoiceLoaderData = InvoiceRouteInfo['allLoaderData']
//   ^?//
type InvoiceAction = InvoiceRouteInfo['actionPayload']
//   ^?

const router = new Router({
  routes,
})

const loaderData = router.getRoute('/dashboard/users/:userId').getLoaderData()
//    ^?
const route = router.getRoute('/dashboard/users/:userId')
//    ^?
const action = route.getAction()
//    ^?
const result = action.submit({ amount: 10000 })
//    ^?

router.link({
  from: '/dashboard/invoices/:invoiceId',
})

// @ts-expect-error
router.link({
  from: '/',
  to: '/test',
})

router.link({
  from: '/',
  to: '/test',
  search: () => {
    return {
      version: 2,
      isGood: true,
    }
  },
})

router.link({
  from: '/test',
  to: '/',
})

router.link({
  from: '/test',
  to: '/',
})

route.link({
  to: '',
})

router.getRoute('/dashboard').link({
  to: '/dashboard/invoices',
  params: {
    invoiceId: 2,
  },
})

router.getRoute('/dashboard').link({
  to: '/dashboard/invoices/:invoiceId',
  params: {
    // @ts-expect-error
    invoiceId: '2',
  },
})

router.getRoute('/').link({
  to: '/dashboard/invoices/:invoiceId',
  params: {
    invoiceId: 2,
  },
})

router.getRoute('/').link({
  to: '/',
  search: {
    version: 2,
  },
})

router.getRoute('/').link({
  to: '/dashboard/users/:userId',
  params: (current) => ({
    userId:
      // @ts-expect-error
      current?.invoiceId,
  }),
  search: (old) => ({
    usersView: {
      sortBy: 'email',
      filterBy: String(old.version),
    },
  }),
})

router.getRoute('/dashboard/invoices/:invoiceId').link({
  to: '/dashboard/users/:userId',
  params: (current) => ({
    userId: `${current?.invoiceId}`,
  }),
  search: () => {
    return {
      usersView: {
        sortBy: 'name' as const,
        filterBy: 'tanner',
      },
    }
  },
})

router.link({
  from: '/',
  to: '/dashboard/users/:userId',
  params: {
    userId: '2',
  },
  search: (prev) => ({
    usersView: {
      sortBy: 'email',
      filterBy: `${prev.version}`,
    },
  }),
})

router.link({
  from: '/dashboard/invoices',
  to: '/dashboard',
})

router.getRoute('/').link({
  to: '/dashboard/invoices/:invoiceId',
  params: {
    invoiceId: 2,
  },
  // search: d => d
})

router.getRoute('/dashboard/invoices/:invoiceId').link({
  // to: '',
  params: (d) => ({
    invoiceId: d.invoiceId,
  }),
})
