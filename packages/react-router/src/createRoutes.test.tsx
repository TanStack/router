import * as React from 'react'
import { z } from 'zod'
import { createRoutes, Router, RoutesInfo, Link } from '.'

const paramTest = createRoutes().addChildren((createRoute) => [
  createRoute({
    path: ':a1',
    loader: async ({ params }) => {
      params.a1
      return {}
    },
  }).addChildren((createRoute) => [
    createRoute({
      path: ':a2',
      loader: async ({ params }) => {
        params.a1
        params.a2
        return {}
      },
    }),
    createRoute({
      path: ':a3',
      loader: async ({ params }) => {
        params.a1
        params.a3
        return {
          params,
        }
      },
    }),
  ]),
  createRoute({
    path: ':b1',
    loader: async ({ params }) => {
      params.b1
      return {}
    },
  }).addChildren((createRoute) => [
    createRoute({
      path: ':b2',
      loader: async ({ params }) => {
        params.b1
        params.b2
        return {}
      },
    }),
  ]),
])

const searchSchemaTest = createRoutes({
  searchSchema: {
    userId: z.string(),
  },
  loader: async ({ search }) => {
    search.userId
    return {}
  },
}).addChildren((createRoute) => [
  createRoute({
    path: '/',
  }),
  createRoute({
    path: 'dashboard',
    searchSchema: {
      version: z.string(),
      dateRange: z.tuple([z.number(), z.number()]).optional(),
    },
    loader: async ({ search }) => {
      search.userId, search.dateRange, search.version

      return {
        invoices: 'invoices' as const,
      }
    },
  }).addChildren((createRoute) => [
    createRoute({
      path: 'invoices',
    }).addChildren((createRoute) => [
      createRoute({
        path: '/',
        loader: async ({ search }) => {
          return {
            invoices: 'invoices' as const,
          }
        },
        action: async (partialInvoice: 'partialInvoince', ctx) => {
          const invoice = await Promise.resolve(
            `postInvoice(${partialInvoice})`,
          )

          // // Redirect to the new invoice
          // ctx.router.navigate({
          //   to: invoice,
          //   // Use the current match for relative paths
          //   from: ctx.match.pathname,
          // })

          return invoice
        },
      }),
      createRoute({
        path: ':invoiceId',
        loader: async ({ params, search }) => {
          return {
            invoice: `fetchInvoiceById(${params.invoiceId}!)`,
          }
        },
        action: (invoice: 'invoice') =>
          Promise.resolve('invoiceResponse' as const),
      }),
    ]),
    createRoute({
      path: 'users',
      loader: async () => {
        return {
          users: 'fetchUsers()',
        }
      },
      preSearchFilters: [
        // Keep the usersView search param around
        // while in this route (or it's children!)
        (search) => ({
          ...search,
          hello: true,
        }),
      ],
    }).addChildren((createRoute) => [
      createRoute({
        path: ':userId',
        loader: async ({ params }) => {
          return {
            user: `fetchUserById(${params.userId}!)`,
          }
        },
      }),
    ]),
  ]),
  createRoute({
    // Your elements can be asynchronous, which means you can code-split!
    path: 'expensive',
  }),
  createRoute({
    path: 'authenticated/',
  }).addChildren((createRoute) => [
    createRoute({
      path: '/',
      // element: <Authenticated />,
    }),
  ]),
])

type MyRoutesInfo = RoutesInfo<typeof searchSchemaTest>
//   ^?
type RoutesById = MyRoutesInfo['routesById']
//   ^?
type RoutePaths = keyof RoutesById
//   ^?
type InvoiceRoute = RoutesById['/dashboard/invoices/:invoiceId']
//   ^?
type InvoiceLoaderData = InvoiceRoute['types']['AllLoaderData']
//   ^?

//
//
//
//

//
//
//
//
//
//
//
//

//
//

//
//

// Build our routes. We could do this in our component, too.
const routes = createRoutes().addChildren((createRoute) => [
  createRoute({ path: '/' }),
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
        action: async (partialInvoice: { amount: number }, ctx) => {
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

        loader: async ({ params: { invoiceId } }) => {
          console.log('Fetching invoice...')
          return {
            invoice: 'await fetchInvoiceById(invoiceId!)',
          }
        },
        // action: patchInvoice,
      }),
    ]),
    createRoute({
      path: 'users',

      loader: async () => {
        return {
          users: 'await fetchUsers()',
        }
      },
      searchSchema: {
        usersView: z
          .object({
            sortBy: z.enum(['name', 'id', 'email']).optional(),
            filterBy: z.string().optional(),
          })
          .optional(),
      },
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

const router = new Router({
  routes,
})

const loaderData = router.getRoute('/dashboard/users/:userId').getLoaderData()
//    ^?
const action = router.getRoute('/dashboard/invoices/').getAction()
//    ^?
const result = action.submit({ amount: 10000 })
//    ^?

const route = router.getRoute('/dashboard/invoices/')

const linkProps = route.linkProps({
  //    ^?
  to: '/dashboard/invoices/:invoiceId',
  params: {
    invoiceId: 2,
  },
})

const link = (
  <Link
    {...route.link({
      to: '/dashboard/invoices/:invoiceId',
      params: {
        invoiceId: 2,
      },
    })}
  />
)
//    ^?

///

//

//
