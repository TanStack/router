import { describe, it } from 'vitest'
import { z } from 'zod'
import { createMemoryHistory, RootRoute, Route, Router } from '../src'

const lazyTest = (comp: any, key: any) => {
  comp.preload = () => {}
  return comp
}

// Write a test
describe('everything', () => {
  it('should work', () => {
    // // Build our routes. We could do this in our component, too.
    // const rootRoute = new RootRoute()
    // const indexRoute = new Route({
    //   getParentRoute: () => rootRoute,
    //   path: '/',
    //   validateSearch: (search) =>
    //     z
    //       .object({
    //         version: z.number(),
    //       })
    //       .parse(search),
    // })
    // const testRoute = new Route({
    //   getParentRoute: () => rootRoute,
    //   component: lazyTest(() => import('./TestComponent'), 'NamedComponent'),
    //   path: 'test',
    //   validateSearch: (search) =>
    //     z
    //       .object({
    //         version: z.number(),
    //         isGood: z.boolean(),
    //       })
    //       .parse(search),
    // })
    // const dashboardRoute = new Route({
    //   getParentRoute: () => rootRoute,
    //   path: 'dashboard',
    //   loader: async () => {
    //     console.log('Fetching all invoices...')
    //     return {
    //       invoices: 'await fetchInvoices()',
    //     }
    //   },
    // })
    // const dashboardIndexRoute = new Route({
    //   getParentRoute: () => dashboardRoute,
    //   path: '/',
    // })
    // const invoicesRoute = new Route({
    //   getParentRoute: () => dashboardRoute,
    //   path: 'invoices',
    // })
    // const invoicesIndexRoute = new Route({
    //   getParentRoute: () => invoicesRoute,
    //   path: '/',
    // })
    // const invoiceRoute = new Route({
    //   getParentRoute: () => invoicesRoute,
    //   path: '$invoiceId',
    //   parseParams: ({ invoiceId }) => ({ invoiceId: Number(invoiceId) }),
    //   stringifyParams: ({ invoiceId }) => ({
    //     invoiceId: String(invoiceId),
    //   }),
    //   loader: async ({ params: { invoiceId } }) => {
    //     console.log('Fetching invoice...')
    //     return {
    //       invoice: 'await fetchInvoiceById(invoiceId!)',
    //     }
    //   },
    // })
    // const usersRoute = new Route({
    //   getParentRoute: () => dashboardRoute,
    //   path: 'users',
    //   loader: async () => {
    //     return {
    //       users: 'await fetchUsers()',
    //     }
    //   },
    //   validateSearch: (search) =>
    //     z
    //       .object({
    //         usersView: z
    //           .object({
    //             sortBy: z.enum(['name', 'id', 'email']).optional(),
    //             filterBy: z.string().optional(),
    //           })
    //           .optional(),
    //       })
    //       .parse(search),
    //   preSearchFilters: [
    //     // Keep the usersView search param around
    //     // while in this route (or it's children!)
    //     (search) => ({
    //       ...search,
    //       usersView: {
    //         ...search.usersView,
    //       },
    //     }),
    //   ],
    // })
    // const userRoute = new Route({
    //   getParentRoute: () => usersRoute,
    //   path: '$userId',
    //   loader: async ({ params: { userId }, search }) => {
    //     return {
    //       user: 'await fetchUserById(userId!)',
    //     }
    //   },
    // })
    // const authenticatedRoute = new Route({
    //   getParentRoute: () => rootRoute,
    //   path: 'authenticated/', // Trailing slash doesn't mean anything
    // })
    // const authenticatedIndexRoute = new Route({
    //   getParentRoute: () => authenticatedRoute,
    //   path: '/',
    // })
    // const layoutRoute = new Route({
    //   getParentRoute: () => rootRoute,
    //   id: 'layout',
    //   component: () => 'layout-wrapper',
    //   validateSearch: (search) =>
    //     z
    //       .object({
    //         isLayout: z.boolean(),
    //       })
    //       .parse(search),
    // })
    // const layoutARoute = new Route({
    //   getParentRoute: () => layoutRoute,
    //   path: 'layout-a',
    //   component: () => 'layout-a',
    // })
    // const layoutBRoute = new Route({
    //   getParentRoute: () => layoutRoute,
    //   path: 'layout-b',
    //   component: () => 'layout-b',
    // })
    // const routeTree = rootRoute.addChildren([
    //   indexRoute,
    //   testRoute,
    //   dashboardRoute.addChildren([
    //     dashboardIndexRoute,
    //     invoicesRoute.addChildren([invoicesIndexRoute, invoiceRoute]),
    //     usersRoute.addChildren([userRoute]),
    //   ]),
    //   authenticatedRoute.addChildren([authenticatedIndexRoute]),
    //   layoutRoute.addChildren([layoutARoute, layoutBRoute]),
    // ])
    // const router = new Router({
    //   routeTree,
    //   history: createMemoryHistory({
    //     initialEntries: ['/?version=1'],
    //   }),
    // })
    // const route = router.getRoute('/dashboard/users/$userId')
    // router.buildLink({
    //   to: '/dashboard/users/$userId',
    //   params: {
    //     userId: '2',
    //   },
    //   search: (prev) => ({
    //     usersView: {
    //       sortBy: 'email',
    //     },
    //   }),
    // })
    // // @ts-expect-error
    // router.buildLink({
    //   from: '/',
    //   to: '/test',
    // })
    // router.buildLink({
    //   from: '/',
    //   to: '/test',
    //   search: () => {
    //     return {
    //       version: 2,
    //       isGood: true,
    //     }
    //   },
    // })
    // router.buildLink({
    //   from: '/test',
    //   to: '/',
    // })
    // router.buildLink({
    //   from: route.id,
    //   to: '',
    // })
    // router.buildLink({
    //   from: '/dashboard',
    //   to: '/dashboard/invoices',
    //   params: {
    //     invoiceId: 2,
    //   },
    // })
    // router.buildLink({
    //   from: '/dashboard',
    //   to: '/dashboard/invoices/$invoiceId',
    //   params: {
    //     // @ts-expect-error
    //     invoiceId: '2',
    //   },
    // })
    // router.buildLink({
    //   to: '/dashboard/invoices/$invoiceId',
    //   params: {
    //     invoiceId: 2,
    //   },
    // })
    // router.buildLink({
    //   to: '/',
    //   search: {
    //     version: 2,
    //   },
    // })
    // router.buildLink({
    //   to: '/dashboard/users/$userId',
    //   // @ts-expect-error
    //   params: (current) => ({
    //     userId: current?.invoiceId,
    //   }),
    //   search: (old) => ({
    //     usersView: {
    //       sortBy: 'email' as const,
    //       filterBy: String(old.version),
    //     },
    //   }),
    // })
    // router.buildLink({
    //   from: '/dashboard/invoices/$invoiceId',
    //   to: '/dashboard/users/$userId',
    //   params: (current) => ({
    //     userId: `${current?.invoiceId}`,
    //   }),
    //   search: (prev) => {
    //     return {
    //       usersView: {
    //         sortBy: 'name' as const,
    //         filterBy: 'tanner',
    //       },
    //     }
    //   },
    // })
    // router.buildLink({
    //   from: '/dashboard/users/$userId',
    //   to: '/',
    //   search: (prev) => {
    //     return {
    //       version: 2,
    //     }
    //   },
    // })
    // router.buildLink({
    //   from: '/',
    //   to: '/dashboard/users/$userId',
    //   params: {
    //     userId: '2',
    //   },
    //   search: (prev) => ({
    //     usersView: {
    //       sortBy: 'id',
    //       filterBy: `${prev.version}`,
    //     },
    //   }),
    // })
    // router.navigate({
    //   search: (prev: any) => ({
    //     version: prev.version,
    //   }),
    // })
    // router.buildLink({
    //   from: '/dashboard/invoices',
    //   to: '/dashboard',
    // })
    // router.buildLink({
    //   from: '/',
    //   // @ts-expect-error
    //   to: '/does-not-exist',
    // })
    // router.buildLink({
    //   to: '/dashboard/invoices/$invoiceId',
    //   params: {
    //     invoiceId: 2,
    //   },
    // })
    // router.buildLink({
    //   from: '/dashboard/invoices/$invoiceId',
    //   to: '.',
    //   params: (d) => ({
    //     invoiceId: d.invoiceId,
    //   }),
    // })
    // router.buildLink({
    //   from: '/dashboard/invoices/$invoiceId',
    //   to: testRoute.fullPath,
    //   search: {
    //     version: 2,
    //     isGood: true,
    //   },
    // })
    // router.buildLink({
    //   to: '/layout-a',
    //   search: (current) => ({
    //     isLayout: !!current.version,
    //   }),
    // })
    // router.buildLink({
    //   to: '/',
    //   state: true,
    // })
    // router.buildLink({
    //   to: '/',
    //   state: {},
    // })
    // router.buildLink({
    //   to: '/',
    //   state: (prev) => prev,
    // })
    // router.buildLink({
    //   to: '/',
    //   state: (prev) => ({
    //     test: true,
    //   }),
    // })
  })
})
