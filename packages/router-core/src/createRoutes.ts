import { Merge } from 'ts-toolbelt/out/Union/Merge'
import { extendShape, z, ZodObject } from 'zod'
import { RouterInstance, LoaderData, Route, AnyLoaderData } from '.'

type AnyRouteDef = RouteDef<any, any, any, any, any>

export type RouteOptions<
  TPath extends string = string,
  TLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TSearchSchema extends ZodObject<any> = ZodObject<any>,
> = Omit<
  Route<TPath, TLoaderData, TActionPayload, TActionResponse, TSearchSchema>,
  'children'
>

export type RouteDef<
  TPath extends string = string,
  TLoaderData extends AnyLoaderData = {},
  TActionPayload = unknown,
  TActionResponse = unknown,
  TSearchSchema extends ZodObject<any> = ZodObject<any>,
  TKnownChildren extends AnyRouteDef[] = RouteDef<
    any,
    any,
    any,
    any,
    any,
    any
  >[],
> = {
  options: RouteOptions<
    TPath,
    TLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchSchema
  >
  children?: TKnownChildren
  addChildren: <TNewChildren extends AnyRouteDef[]>(
    cb: (
      createChildRoute: CreateRouteFn<
        RouteOptions<
          TPath,
          TLoaderData,
          TActionPayload,
          TActionResponse,
          TSearchSchema
        >
      >,
    ) => TNewChildren,
  ) => RouteDef<
    TPath,
    TLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchSchema,
    TNewChildren
  >
}

type CreateRouteFn<
  TParentRouteOptions extends RouteOptions<
    any,
    any,
    any,
    any,
    any
  > = RouteOptions<any, any, any, any, any>,
> = <
  TPath extends string,
  TLoaderData extends AnyLoaderData,
  TActionPayload,
  TActionResponse,
  TSearchSchema extends ZodObject<any>,
  TChildren extends AnyRouteDef[] = AnyRouteDef[],
>(
  options: RouteOptions<
    TPath,
    TLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchSchema
  >,
  parentOptions?: TParentRouteOptions,
  children?: TChildren,
) => RouteDef<
  TPath,
  TLoaderData,
  TActionPayload,
  TActionResponse,
  TSearchSchema,
  TChildren
>

const createRoute: CreateRouteFn = <
  TPath extends string,
  TLoaderData extends AnyLoaderData,
  TActionPayload,
  TActionResponse,
  TSearchSchema extends ZodObject<any>,
  TChildren extends AnyRouteDef[] = AnyRouteDef[],
>(
  options: RouteOptions<
    TPath,
    TLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchSchema
  >,
  parentOptions: any,
  children?: TChildren,
): RouteDef<
  TPath,
  TLoaderData,
  TActionPayload,
  TActionResponse,
  TSearchSchema,
  TChildren
> => {
  const createChildRoute: CreateRouteFn<
    RouteOptions<
      TPath,
      TLoaderData,
      TActionPayload,
      TActionResponse,
      TSearchSchema
    >
  > = (childOptions) => createRoute(childOptions, options)

  const routeDef: RouteDef<
    TPath,
    TLoaderData,
    TActionPayload,
    TActionResponse,
    TSearchSchema,
    TChildren
  > = {
    options,
    children,
    addChildren: (cb) =>
      createRoute(options, parentOptions, cb(createChildRoute)),
  }

  return routeDef
}

const rootRoute = createRoute({
  path: '/',
  searchSchema: z.object({
    version: z.string(),
  }),
}).addChildren((createRoute) => [
  createRoute({ path: '/' }),
  createRoute({
    path: 'dashboard',
    // searchSchema: z.object({
    //   dateRange: z.tuple([z.number(), z.number()]).optional(),
    // }),
    // loader: async ({ search }) => {
    //   return {
    //     invoices: fetchInvoices(search.dateRange),
    //   }
    // },
  }).addChildren((createRoute) => [
    createRoute({ path: '/' }),
    // createRoute({
    //   path: 'invoices',
    // }).addChildren(createRoute => [
    //   createRoute({
    //     path: '/',
    //     // action: async (partialInvoice: 'partialInvoince', ctx) => {
    //     //   const invoice = await Promise.resolve(`postInvoice(${partialInvoice})`)

    //     //   // Redirect to the new invoice
    //     //   ctx.router.navigate({
    //     //     to: invoice,
    //     //     // Use the current match for relative paths
    //     //     from: ctx.match.pathname,
    //     //   })

    //     //   return invoice
    //     // },
    //   }),
    //   createRoute({
    //     path: ':invoiceId',
    //     // loader: async ({ params }) => {
    //     //   return {
    //     //     invoice: `fetchInvoiceById(${params.invoiceId}!)`,
    //     //   }
    //     // },
    //     // action: (invoice: 'invoice') => Promise.resolve('invoiceResponse' as const),
    //   })
    // ]),
    // createRoute({
    //   path: 'users',
    //   // loader: async () => {
    //   //   return {
    //   //     users: 'fetchUsers()',
    //   //   }
    //   // },
    //   // preSearchFilters: [
    //   //   // Keep the usersView search param around
    //   //   // while in this route (or it's children!)
    //   //   (search) => ({
    //   //     ...search,
    //   //     hello: true,
    //   //   }),
    //   // ],
    // }).addChildren(createRoute => [
    //   createRoute({
    //     path: ':userId',
    //     // loader: async ({ params: { userId } }) => {
    //     //   return {
    //     //     user: `fetchUserById(${userId}!)`,
    //     //   }
    //     // },
    //   })
    // ])
  ]),
  // createRoute({
  //   // Your elements can be asynchronous, which means you can code-split!
  //   path: 'expensive',
  // }),
  // createRoute({
  //   path: 'authenticated/',
  // }).addChildren(createRoute => [
  //   createRoute({
  //     path: '/',
  //     // element: <Authenticated />,
  //   })
  // ])
])

// type Narrow<T> = Try<T, [], NarrowRaw<T>>
// type Try<A, B, C> = A extends B ? A : C
// type NarrowRaw<T> =
//   | (T extends [] ? [] : never)
//   | (T extends string | number | bigint | boolean ? T : never)
//   | {
//       [K in keyof T]: T[K] extends Function ? T[K] : NarrowRaw<T[K]>
//     }

///////

// type RoutesMeta<
//   TRoutes extends RouteDef<any, any, any, any, any, any>[],
//   TMetas extends ParseRoutesMeta<TRoutes> = ParseRoutesMeta<TRoutes>,
//   TRoutesByPath extends IndexObj<TMetas, 'fullPath'> = IndexObj<
//     TMetas,
//     'fullPath'
//   >,
//   TFullZodSchemas extends Extract<
//     TMetas,
//     { searchSchema: {} }
//   >['searchSchema'] = Extract<TMetas, { searchSchema: {} }>['searchSchema'],
// > = {
//   routesUnion: TMetas
//   routesRecord: TRoutesByPath
//   params: TMetas['param']
//   routesByParams: IndexObj<TMetas, 'param'>
//   allLoaderData: Expand<
//     UnionToIntersection<Extract<TMetas, { loaderData: {} }>['loaderData']>
//   >
//   allZodSchemas: TFullZodSchemas
//   fullSearchSchema: Expand<UnionToIntersection<z.infer<TFullZodSchemas>>>
// }

// type IndexObj<T extends Record<PropertyKey, any>, TKey extends keyof T> = {
//   [E in T as E[TKey]]: E
// }

// type MergeZodObjects<T, U> = T extends ZodObject<any, infer TUnknownKeys> ? ZodObject<extendShape<U, ReturnType<T["_def"]["shape"]>>, TUnknownKeys, Catchall> : never

// type ParseRoutesMeta<
//   TRoutes extends RouteDef<any, any, any, any, any, any>[],
//   TPrefix extends string = '',
//   TAllLoaderData = {},
// > = Expand<
//   Values<{
//     [TPath in TRoutes[number]['path']]:
//       | ParseRouteMeta<TPath, TRoutes[number], TPrefix, TAllLoaderData>
//       | ParseRouteChildren<
//           TPath,
//           TRoutes[number],
//           ParseRouteMeta<
//             TPath,
//             TRoutes[number],
//             TPrefix,
//             TAllLoaderData
//           >['fullPath'],
//           ParseRouteMeta<
//             TPath,
//             TRoutes[number],
//             TPrefix,
//             TAllLoaderData
//           >['allLoaderData']
//         >
//   }>
// >

// export type Values<O> = O[StringKeys<O>]
// export type StringKeys<O> = Extract<keyof O, string>

// type ParseRouteChildren<
//   TPath,
//   TRoute,
//   TPrefix extends string,
//   TAllLoaderData = {},
// > = TRoute & { path: TPath } extends RouteDef<
//   any,
//   any,
//   any,
//   any,
//   any,
//   infer TChildren
// >
//   ? TChildren extends AnyRouteDef[]
//     ? ParseRoutesMeta<TChildren, TPrefix, TAllLoaderData>
//     : never
//   : never

// type ParseRouteMeta<
//   TPath = string,
//   TRoute = RouteDef<any, any, any, any, any, any>,
//   TPrefix extends string = string,
//   TAllLoaderData = {},
// > = TRoute & { path: TPath } extends RouteDef<
//   infer TPath,
//   infer TLoaderData,
//   infer TActionPayload,
//   infer TActionResponse,
//   infer TSearchSchema
// >
//   ? {
//       path: `${TPath}`
//       cleanPath: CleanPath<TPath>
//       fullPath: `${TrimPathRight<TPrefix>}/${TrimPath<TPath>}`
//       param: ParsePathParam<TPath>
//       loaderData: DeepAwaited<TLoaderData>
//       allLoaderData: Expand<
//         UnionToIntersection<TAllLoaderData & DeepAwaited<TLoaderData>>
//       >
//       actionPayload: TActionPayload
//       actionResponse: DeepAwaited<TActionResponse>
//       searchSchema: TSearchSchema
//       route: TRoute
//     }
//   : never

// type DeepAwaited<T> = T extends Promise<infer A>
//   ? DeepAwaited<A>
//   : T extends Record<infer A, Promise<infer B>>
//   ? { [K in A]: DeepAwaited<B> }
//   : T

// type CleanPath<T extends string> = '/' extends T ? '/' : TrimPath<T>

// type TrimPath<T extends string> = '' extends T
//   ? ''
//   : TrimPathRight<TrimPathLeft<T>>

// type TrimPathLeft<T extends string> = T extends `/${infer U}`
//   ? TrimPathLeft<U>
//   : T
// type TrimPathRight<T extends string> = T extends `${infer U}/`
//   ? TrimPathRight<U>
//   : T

// export type ParsePathParam<T, N = never> = T extends string
//   ? TrimPath<T> extends `:${infer U}`
//     ? U
//     : N
//   : never

// type Expand<T> = T extends object
//   ? T extends infer O
//     ? { [K in keyof O]: O[K] }
//     : never
//   : T

// type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
//   k: infer I,
// ) => any
//   ? I
//   : never

// const routes = [
//   createRoute({
//     path: '/',
//     searchSchema: z.object({
//       version: z.string(),
//     }),
//     children: [
//       createRoute({ path: '/', id: 'home' }),
//       createRoute({
//         path: 'dashboard',
//         searchSchema: z.object({
//           dateRange: z.tuple([z.number(), z.number()]).optional(),
//         }),

//         loader: async ({ search }) => {
//           return {
//             invoices: fetchInvoices(search.dateRange),
//           }
//         },
//         children: [
//           createRoute({ path: '/' }),
//           createRoute({
//             path: 'invoices',
//             children: [
//               createRoute({ path: 'test' }),
//               createRoute({
//                 path: '/',
//                 action: async (partialInvoice: 'partialInvoince', ctx) => {
//                   const invoice = await Promise.resolve(
//                     `postInvoice(${partialInvoice})`,
//                   )

//                   // Redirect to the new invoice
//                   ctx.router.navigate({
//                     to: invoice,
//                     // Use the current match for relative paths
//                     from: ctx.match.pathname,
//                   })

//                   return invoice
//                 },
//               }),
//               createRoute({
//                 path: ':invoiceId',
//                 loader: async ({ params }) => {
//                   return {
//                     invoice: `fetchInvoiceById(${params.invoiceId}!)`,
//                   }
//                 },
//                 action: (invoice: 'invoice') =>
//                   Promise.resolve('invoiceResponse' as const),
//               }),
//             ],
//           }),
//           createRoute({
//             path: 'users',
//             loader: async () => {
//               return {
//                 users: 'fetchUsers()',
//               }
//             },
//             preSearchFilters: [
//               // Keep the usersView search param around
//               // while in this route (or it's children!)
//               (search) => ({
//                 ...search,
//                 hello: true,
//               }),
//             ],
//             children: [
//               createRoute({
//                 path: ':userId',
//                 loader: async ({ params: { userId } }) => {
//                   return {
//                     user: `fetchUserById(${userId}!)`,
//                   }
//                 },
//               }),
//             ],
//           }),
//         ],
//       }),
//       createRoute({
//         // Your elements can be asynchronous, which means you can code-split!
//         path: 'expensive',
//       }),
//       // Obviously, you can put routes in other files, too
//       // reallyExpensiveRoute,
//       createRoute({
//         path: 'authenticated/',
//         children: [
//           {
//             path: '/',
//             // element: <Authenticated />,
//           },
//         ],
//       }),
//     ],
//   }),
// ]

// type MyRoutes = typeof routes
// type MyRoutesMeta = RoutesMeta<MyRoutes>
// type Routes = MyRoutesMeta['routesRecord']
// type InvoiceRoute = Routes['/dashboard/invoices/:invoiceId']
// type InvoiceLoaderData = InvoiceRoute['loaderData']
// type MyParams = MyRoutesMeta['params']
// type MyLoaderData = MyRoutesMeta['allLoaderData']
// type FullSearchSchema = z.infer<MyRoutesMeta['allZodSchemas']>
// type FullSearchSchema = MyRoutesMeta['fullSearchSchema']

// let test: FullSearchSchema = {
//   version: '2',
//   dateRange: [1, 2],
// }

// const router = new RouterInstance({
//   routes,
// })

// type Routes<
//   TPrevRoutes extends Record<string, Route<any, any, any>>,
//   TParsed = RoutesMeta<TPrevRoutes>,
// > = {
//   routes: TPrevRoutes
//   add: <
//     TPath extends string,
//     TLoaderData extends LoaderData,
//     TActionPayload,
//     TActionResponse,
//   >(
//     path: TPath,
//     route: Omit<
//       Route<TPath, TLoaderData, TActionPayload, TActionResponse>,
//       'path'
//     >,
//   ) => Routes<
//     TPrevRoutes &
//       Record<TPath, Route<TPath, TLoaderData, TActionPayload, TActionResponse>>
//   >
//   meta: TParsed
// }

// export function createRoutes<
//   TRoutes extends Record<string, Route<any, any, any, any>>,
// >(
//   _?: undefined,
//   __?: undefined,
//   routes: TRoutes = {} as TRoutes,
// ): Routes<TRoutes> {
//   return {
//     routes,
//     add: (path, route) =>
//       createRoutes(undefined, undefined, {
//         ...routes,
//         [path]: {
//           ...route,
//           path,
//         },
//       }) as any,
//     meta: undefined!,
//   }
// }

// [
//   {
//     path: '/',
//     children: [
//       { path: '/', id: 'home' },
//       {
//         path: 'dashboard',
//         loader: async () => {
//           return {
//             invoices: Promise.resolve('fetchInvoices()'),
//           }
//         },
//         children: [
//           { path: '/' },
//           {
//             path: 'invoices',
//             children: [
//               {
//                 path: '/',
//                 action: async (
//                   partialInvoice: 'partialInvoince',
//                   ctx: ActionContext,
//                 ) => {
//                   const invoice = await Promise.resolve(
//                     `postInvoice(${partialInvoice})`,
//                   )

//                   // Redirect to the new invoice
//                   ctx.router.navigate({
//                     to: invoice,
//                     // Use the current match for relative paths
//                     from: ctx.match.pathname,
//                   })

//                   return invoice
//                 },
//               },
//               {
//                 path: ':invoiceId',
//                 loader: async ({ params }: RouteMatch) => {
//                   return {
//                     invoice: Promise.resolve(
//                       `fetchInvoiceById(${params.invoiceId}!)`,
//                     ),
//                   }
//                 },
//                 action: (invoice: 'invoice') =>
//                   Promise.resolve('invoiceResponse'),
//               },
//             ],
//           },
//           {
//             path: 'users',
//             loader: async () => {
//               return {
//                 users: Promise.resolve('fetchUsers()'),
//               }
//             },
//             preSearchFilters: [
//               // Keep the usersView search param around
//               // while in this route (or it's children!)
//               (search) => ({
//                 ...search,
//                 hello: true,
//               }),
//             ],
//             children: [
//               {
//                 path: ':userId',
//                 loader: async ({ params: { userId } }: RouteMatch) => {
//                   return {
//                     user: Promise.resolve(`fetchUserById(${userId}!)`),
//                   }
//                 },
//               },
//             ],
//           },
//         ],
//       },
//       {
//         // Your elements can be asynchronous, which means you can code-split!
//         path: 'expensive',
//       },
//       // Obviously, you can put routes in other files, too
//       // reallyExpensiveRoute,
//       {
//         path: 'authenticated/',
//         children: [
//           {
//             path: '/',
//             // element: <Authenticated />,
//           },
//         ],
//       },
//     ],
//   },
// ]

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
