import { AnyAllRouteInfo, Route } from '@tanstack/router-core'
import * as React from 'react'
import { z } from 'zod'
import { createRoutes, Router, AnyRouteDef, AllRouteInfo } from '.'

const paramTest = createRoutes().addChildren((createRoute) => {
  return [
    createRoute({
      path: ':a1',
      parseParams: ({ a1 }) => ({
        a1: Number(a1),
        hello: 'world',
      }),
      stringifyParams: ({ a1 }) => ({ a1: String(a1) }),
      loader: async ({ params }) => {
        return params
        //     ^?
      },
    }).addChildren((createRoute) => {
      return [
        createRoute({
          path: ':a2',
          loader: async ({ params }) => {
            //             ^?
            return params
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
      ]
    }),
    createRoute({
      path: ':b1',
      loader: async ({ params }) => {
        params.b1
        return { params }
      },
    }).addChildren((createRoute) => {
      return [
        createRoute({
          path: ':b2',
          loader: async ({ params }) => {
            params.b1
            params.b2
            return {}
          },
        }),
      ]
    }),
  ]
})

type ParamsRoutesInfo = keyof AllRouteInfo<typeof paramTest>['routeInfoById']
//   ^?

const searchSchemaTest = createRoutes({
  validateSearch: z.object({
    userId: z.string(),
  }).parse,
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
    validateSearch: z.object({
      version: z.string(),
      dateRange: z.tuple([z.number(), z.number()]).optional(),
    }).parse,
    loader: async ({ search }) => {
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
        action: async (partialInvoice: 'partialInvoince') => {
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
        parseParams: (params) => {
          return {
            invoiceId: Number(params.invoiceId),
          }
        },
        stringifyParams: (params) => {
          return {
            invoiceId: String(params.invoiceId),
          }
        },
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
//   ^?

type MyRoutesInfo = AllRouteInfo<typeof searchSchemaTest>
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
type InvoiceRouteInfo = RoutesById['/dashboard/invoices/:invoiceId']
//   ^?
type InvoiceLoaderData = InvoiceRouteInfo['allLoaderData']
//   ^?//
type InvoiceAction = InvoiceRouteInfo['actionPayload']
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
      other: z.boolean(),
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
        sortBy: 'name',
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
