import { Route, ActionContext, RouteMatch, RouterInstance } from '.'

export function createRoutes<TRoutes extends Route[]>(routes: Narrow<TRoutes>) {
  return routes
}

type Narrow<T> = Try<T, [], NarrowRaw<T>>
type Try<A, B, C> = A extends B ? A : C
type NarrowRaw<T> =
  | (T extends [] ? [] : never)
  | (T extends string | number | bigint | boolean ? T : never)
  | {
      [K in keyof T]: T[K] extends Function ? T[K] : NarrowRaw<T[K]>
    }

///////

type RouteLike = {
  path?: string
  children?: RouteLike[]
}

type RouteWithChildrenLike = {
  path?: string
  children: RouteLike[]
}

type RoutesMeta<
  TRoutes extends RouteLike[],
  TParsed extends RouteMeta<any, any, any> = ParseRoutesMeta<TRoutes, '', {}>,
> = {
  route: TParsed
  routesByPath: IndexObj<TParsed, 'fullPath'>
  params: TParsed['param']
  routesByParams: IndexObj<TParsed, 'param'>
  allLoaderData: Expand<UnionToIntersection<TParsed['loaderData']>>
}

type IndexObj<T extends Record<PropertyKey, any>, TKey extends keyof T> = {
  [E in T as E[TKey]]: E
}

type ParseRoutesMeta<
  TRoutes extends RouteLike[],
  TPrefix extends string = '',
  TLoaderData = {},
> = {
  [K in keyof TRoutes]:
    | ParseRouteMeta<TRoutes[K], TPrefix, TLoaderData>
    | ParseRouteChildren<
        TRoutes[K],
        ParseRouteMeta<TRoutes[K], TPrefix, TLoaderData>['fullPath'],
        ParseRouteMeta<TRoutes[K], TPrefix, TLoaderData>['allLoaderData']
      >
}[number]

type ParseRouteMeta<
  TRoute,
  TPrefix extends string,
  TLoaderData = {},
> = TRoute extends {
  path: string
}
  ? RouteMeta<TRoute, TPrefix, TLoaderData>
  : never

type RouteMeta<
  TRoute extends { path: string },
  TPrefix extends string = '',
  TLoaderData = {},
> = {
  path: TRoute['path']
  trimmedPath: TrimPath<TRoute['path']>
  hierarchicalPath: `${TPrefix}/${TrimPath<TRoute['path']>}`
  fullPath: `/${TrimPath<`${TPrefix}/${TrimPath<TRoute['path']>}`>}`
  param: ParsePathParam<TRoute['path']>
  route: TRoute
  loaderData: ParseRouteLoaderReturnType<TRoute>
  allLoaderData: Expand<
    UnionToIntersection<TLoaderData & ParseRouteLoaderReturnType<TRoute>>
  >
  actionPayload: ParseRouteActionPayload<TRoute>
  actionData: ParseRouteActionReturnType<TRoute>
}

type ParseRouteLoaderReturnType<TRoute> = TRoute extends { loader: infer A }
  ? A extends (...args: any[]) => any
    ? DeepAwaited<ReturnType<A>>
    : never
  : never

type ParseRouteActionPayload<TRoute> = TRoute extends { action: infer A }
  ? A extends (arg: infer A) => any
    ? A
    : never
  : never

type ParseRouteActionReturnType<TRoute> = TRoute extends { action: infer A }
  ? A extends (...args: any[]) => any
    ? DeepAwaited<ReturnType<A>>
    : never
  : never

type DeepAwaited<T> = T extends Promise<infer A>
  ? DeepAwaited<A>
  : T extends Record<infer A, Promise<infer B>>
  ? { [K in A]: DeepAwaited<B> }
  : T

type ParseRouteChildren<
  TRoute,
  TPrefix extends string,
  TLoaderData = {},
> = TRoute extends RouteWithChildrenLike
  ? TRoute['children']['length'] extends 0
    ? never
    : ParseRoutesMeta<TRoute['children'], TPrefix, TLoaderData>
  : never

type TrimPath<T extends string> = '' extends T
  ? ''
  : T extends `/${infer U}`
  ? TrimPath<U>
  : T extends `${infer U}/`
  ? TrimPath<U>
  : T

export type ParsePathParam<T, N = never> = T extends string
  ? TrimPath<T> extends `:${infer U}`
    ? U
    : N
  : never

type Expand<T> = T extends object
  ? T extends infer O
    ? { [K in keyof O]: O[K] }
    : never
  : T

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => any
  ? I
  : never

const routes = createRoutes([
  {
    path: '/',
    children: [
      { path: '/', id: 'home' },
      {
        path: 'dashboard',
        loader: async () => {
          return {
            invoices: Promise.resolve('fetchInvoices()'),
          }
        },
        children: [
          { path: '/' },
          {
            path: 'invoices',
            children: [
              {
                path: '/',
                action: async (
                  partialInvoice: 'partialInvoince',
                  ctx: ActionContext,
                ) => {
                  const invoice = await Promise.resolve(
                    `postInvoice(${partialInvoice})`,
                  )

                  // Redirect to the new invoice
                  ctx.router.navigate({
                    to: invoice,
                    // Use the current match for relative paths
                    from: ctx.match.pathname,
                  })

                  return invoice
                },
              },
              {
                path: ':invoiceId',
                loader: async ({ params }: RouteMatch) => {
                  return {
                    invoice: Promise.resolve(
                      `fetchInvoiceById(${params.invoiceId}!)`,
                    ),
                  }
                },
                action: (invoice: 'invoice') =>
                  Promise.resolve('invoiceResponse'),
              },
            ],
          },
          {
            path: 'users',
            loader: async () => {
              return {
                users: Promise.resolve('fetchUsers()'),
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
            children: [
              {
                path: ':userId',
                loader: async ({ params: { userId } }: RouteMatch) => {
                  return {
                    user: Promise.resolve(`fetchUserById(${userId}!)`),
                  }
                },
              },
            ],
          },
        ],
      },
      {
        // Your elements can be asynchronous, which means you can code-split!
        path: 'expensive',
      },
      // Obviously, you can put routes in other files, too
      // reallyExpensiveRoute,
      {
        path: 'authenticated/',
        children: [
          {
            path: '/',
            // element: <Authenticated />,
          },
        ],
      },
    ],
  },
])

type MyRoutes = typeof routes
type MyRoutesMeta = RoutesMeta<MyRoutes>
type RoutesByPath = MyRoutesMeta['routesByPath']
type InvoiceRoute = RoutesByPath['/dashboard/invoices/:invoiceId']
type MyParams = MyRoutesMeta['params']
type MyLoaderData = MyRoutesMeta['allLoaderData']

const router = new RouterInstance({
  routes,
})

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

//
