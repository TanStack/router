import { expectTypeOf, test } from 'vitest'
import { isServer } from '@tanstack/router-core/isServer'
import {
  createFileRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  getRouteApi,
  notFound,
  redirect,
  useLoaderData,
  useRouteContext,
} from '../../src'
import type {
  AnyRoute,
  NotFoundError,
  RouteById,
  RouteContextOptions,
} from '../../src'
import type { Expand } from '@tanstack/router-core'

// Lifecycle option forms under a Start register: `Register.ssr` is `true`, so a
// transported lifecycle result (beforeLoad and loader by default, context with
// `dehydrate: true`) and a codec wire (the return value of a `dehydrate` function)
// must be serializable, unless the route or an ancestor opts out with `ssr: false`.
// The `Register` augmentation is global to a tsc program, so this folder is its own
// vitest project with its own tsconfig; see tests/lifecycle.test-d.tsx for the
// same matrix in a plain SPA register.

type QueryClient = { fetch: (k: string) => Promise<string> }
type Report = { id: string; when: Date; format: (v: number) => string }
type Wire = { id: string; iso: string }
type Stats = { views: number }
type Prefs = { theme: 'dark' | 'light' }
// the data type of a lifecycle whose hydrate returns a different shape;
// the discriminant says which function produced the value: `handler` also runs
// in the browser on client navigations, so server versus client cannot tell
// them apart (see the `isServer` test)
type StatsData =
  | { hydrated: false; stats: Stats }
  | { hydrated: true; stats: Stats; prefs: Prefs }
declare const flag: boolean
declare function fetchStats(): Promise<Stats>
declare function readPrefs(): Promise<Prefs>

const rootRoute = createRootRouteWithContext<{
  queryClient: QueryClient
  user: string
}>()({
  context: ({ context }) => ({ rootCtx: context.user.length }),
  beforeLoad: ({ context }) =>
    Promise.resolve({ rootBl: `${context.rootCtx}` }),
  loader: ({ context }) => ({ rootLoader: context.rootBl }),
})

declare module '@tanstack/router-core' {
  interface Register {
    ssr: true
    router: typeof router
  }
  interface FileRoutesByPath {
    '/context-redirect': {
      id: '/context-redirect'
      path: '/context-redirect'
      fullPath: '/context-redirect'
      preLoaderRoute: typeof contextRedirectRoute
      parentRoute: typeof rootRoute
    }
    '/context-revalidate-redirect': {
      id: '/context-revalidate-redirect'
      path: '/context-revalidate-redirect'
      fullPath: '/context-revalidate-redirect'
      preLoaderRoute: typeof contextRevalidateRedirectRoute
      parentRoute: typeof rootRoute
    }
    '/fn/$id': {
      id: '/fn/$id'
      path: '/fn/$id'
      fullPath: '/fn/$id'
      preLoaderRoute: typeof fnRoute
      parentRoute: typeof rootRoute
    }
    '/fn-bad': {
      id: '/fn-bad'
      path: '/fn-bad'
      fullPath: '/fn-bad'
      preLoaderRoute: typeof _fnBadRoute
      parentRoute: typeof rootRoute
    }
    '/handler': {
      id: '/handler'
      path: '/handler'
      fullPath: '/handler'
      preLoaderRoute: typeof handlerRoute
      parentRoute: typeof rootRoute
    }
    '/handler-bad': {
      id: '/handler-bad'
      path: '/handler-bad'
      fullPath: '/handler-bad'
      preLoaderRoute: typeof _handlerBadRoute
      parentRoute: typeof rootRoute
    }
    '/codec/$id': {
      id: '/codec/$id'
      path: '/codec/$id'
      fullPath: '/codec/$id'
      preLoaderRoute: typeof codecRoute
      parentRoute: typeof rootRoute
    }
    '/codec-bad': {
      id: '/codec-bad'
      path: '/codec-bad'
      fullPath: '/codec-bad'
      preLoaderRoute: typeof _codecBadRoute
      parentRoute: typeof rootRoute
    }
    '/nossr': {
      id: '/nossr'
      path: '/nossr'
      fullPath: '/nossr'
      preLoaderRoute: typeof noSsrRoute
      parentRoute: typeof rootRoute
    }
    '/nossr/child': {
      id: '/nossr/child'
      path: '/child'
      fullPath: '/nossr/child'
      preLoaderRoute: typeof noSsrChildRoute
      parentRoute: typeof noSsrRoute
    }
    '/parent': {
      id: '/parent'
      path: '/parent'
      fullPath: '/parent'
      preLoaderRoute: typeof parentRoute
      parentRoute: typeof rootRoute
    }
    '/parent/child': {
      id: '/parent/child'
      path: '/child'
      fullPath: '/parent/child'
      preLoaderRoute: typeof childRoute
      parentRoute: typeof parentRoute
    }
    '/hydrated': {
      id: '/hydrated'
      path: '/hydrated'
      fullPath: '/hydrated'
      preLoaderRoute: typeof hydratedRoute
      parentRoute: typeof rootRoute
    }
  }
}

// ---------------------------------------------------------------------------
// function form
// ---------------------------------------------------------------------------

const contextRedirectRoute = createFileRoute('/context-redirect')({
  context: {
    handler: () => {
      if (flag) {
        return redirect({ to: '/' })
      }
      return { session: 'user' }
    },
    dehydrate: true,
    hydrate: ({ data }) => {
      expectTypeOf(data).toEqualTypeOf<{ session: string }>()
      return data
    },
  },
  beforeLoad: ({ context }) => {
    expectTypeOf(context.session).toEqualTypeOf<string>()
  },
  loader: ({ context }) => context.session,
})

const contextRevalidateRedirectRoute = createFileRoute(
  '/context-revalidate-redirect',
)({
  context: {
    handler: () => ({ session: 'user' }),
    dehydrate: true,
    revalidate: async ({ prev }) => {
      expectTypeOf(prev).toEqualTypeOf<{ session: string } | undefined>()
      if (flag) {
        return redirect({ to: '/' })
      }
      return { session: 'next' }
    },
  },
  loader: ({ context }) => context.session,
})

const fnRoute = createFileRoute('/fn/$id')({
  validateSearch: () => ({ page: 0 }),
  loaderDeps: ({ search }) => ({ page: search.page }),
  // context is not transported by default: functions are fine here
  context: ({ context, params, deps }) => ({
    c: context.rootCtx + deps.page,
    p: params,
    cFn: () => 1,
  }),
  beforeLoad: ({ context, search }) => ({ b: `${context.c}-${search.page}` }),
  loader: ({ context, deps }) =>
    Promise.resolve({
      items: [context.b, context.rootBl, String(deps.page)],
      when: new Date(),
    }),
})

const _fnBadRoute = createFileRoute('/fn-bad')({
  // @ts-expect-error a transported beforeLoad result must be serializable
  beforeLoad: ({ context }) => ({ fn: () => context.rootCtx }),
  // @ts-expect-error a transported loader result must be serializable
  loader: () => ({ id: 1, fn: () => 1 }),
})

test('function form: validated results and typed ctx', () => {
  expectTypeOf(fnRoute.types.loaderData).toEqualTypeOf<{
    items: Array<string>
    when: Date
  }>()
  expectTypeOf<Expand<typeof fnRoute.types.allContext>>().toEqualTypeOf<{
    queryClient: QueryClient
    user: string
    rootCtx: number
    rootBl: string
    c: number
    p: { id: string }
    cFn: () => number
    b: string
  }>()
})

// ---------------------------------------------------------------------------
// { handler } object form
// ---------------------------------------------------------------------------

const handlerRoute = createFileRoute('/handler')({
  context: {
    handler: ({ context }) => ({ c: context.rootCtx, cFn: () => 1 }),
  },
  beforeLoad: { handler: ({ context }) => Promise.resolve({ b: context.c }) },
  loader: {
    handler: ({ context }) => ({ l: context.b, when: new Date() }),
    staleReloadMode: 'blocking',
  },
})

const _handlerBadRoute = createFileRoute('/handler-bad')({
  loader: {
    handler: ({ context }) => ({
      id: context.rootCtx,
      // @ts-expect-error a transported loader result must be serializable
      fn: () => 1,
    }),
  },
})

test('object form with only a handler is validated like the function form', () => {
  expectTypeOf(handlerRoute.types.loaderData).toEqualTypeOf<{
    l: number
    when: Date
  }>()
  expectTypeOf<Expand<typeof handlerRoute.types.routeContext>>().toEqualTypeOf<{
    c: number
    cFn: () => number
    b: number
  }>()
})

test('context with dehydrate: true is validated, without it functions are fine', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'ctx-local',
    context: { handler: () => ({ qc: new Map<string, number>() }) },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'ctx-transported',
    // @ts-expect-error a transported context result must be serializable
    context: { handler: () => ({ fn: () => 1 }), dehydrate: true },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'ctx-transported-async',
    // @ts-expect-error a transported context result must be serializable
    context: {
      handler: async ({ context }) => ({
        key: await context.queryClient.fetch('k'),
        fn: () => 1,
      }),
      dehydrate: true,
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'bl-async',
    beforeLoad: {
      // @ts-expect-error a transported beforeLoad result must be serializable
      handler: async ({ context }) => ({
        key: await context.queryClient.fetch('k'),
        fn: () => 1,
      }),
    },
  })
})

// ---------------------------------------------------------------------------
// dehydrate: false
// ---------------------------------------------------------------------------

test('dehydrate: false turns validation off for that lifecycle', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'local',
    beforeLoad: { handler: () => ({ bFn: () => 1 }), dehydrate: false },
    loader: {
      handler: ({ context }) => ({ lFn: () => context.bFn() }),
      dehydrate: false,
      staleReloadMode: 'blocking',
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ lFn: () => number }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    bFn: () => number
  }>()
})

// ---------------------------------------------------------------------------
// dehydrate: true + hydrate
// ---------------------------------------------------------------------------

test('dehydrate: true with hydrate: validated, data is the full awaited value', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrate/$id',
    loaderDeps: () => ({ n: 1 }),
    context: {
      handler: async ({ context }) => ({
        c: await context.queryClient.fetch('k'),
      }),
      dehydrate: true,
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ c: string }>()
        return { c: data.c + context.user }
      },
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<{ c: string } | undefined>()
        return Promise.resolve({ c: prev?.c ?? '' })
      },
    },
    loader: {
      handler: ({ params }) =>
        Promise.resolve({ id: params.id, when: new Date() }),
      dehydrate: true,
      hydrate: ({ data, params, context, deps }) => {
        expectTypeOf(data).toEqualTypeOf<{ id: string; when: Date }>()
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        expectTypeOf(deps).toEqualTypeOf<{ n: number }>()
        expectTypeOf(context.c).toEqualTypeOf<string>()
        return {
          id: data.id + params.id + context.rootBl + deps.n,
          when: data.when,
        }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    c: string
  }>()

  // a hydrate returning a wider shape is not an error: loaderData is the union
  const wider = createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrate-wider',
    loader: {
      handler: () => Promise.resolve({ id: 's', when: new Date() }),
      dehydrate: true,
      hydrate: ({ data }) => ({ id: data.id }),
    },
  })
  expectTypeOf(wider.types.loaderData).toEqualTypeOf<
    { id: string; when: Date } | { id: string }
  >()
})

// ---------------------------------------------------------------------------
// codec
// ---------------------------------------------------------------------------

const codecRoute = createFileRoute('/codec/$id')({
  context: {
    handler: ({ params }) => ({ key: params.id, cFn: () => 1 }),
    dehydrate: ({ data }) => ({ key: data.key }),
    hydrate: ({ data }) => {
      expectTypeOf(data).toEqualTypeOf<{ key: string }>()
      return { key: data.key, cFn: () => 2 }
    },
  },
  beforeLoad: {
    handler: ({ context }) => ({ page: context.key.length, bFn: () => 1 }),
    dehydrate: ({ data }) => ({ page: data.page }),
    hydrate: ({ data, context }) => {
      expectTypeOf(data).toEqualTypeOf<{ page: number }>()
      return { page: data.page, bFn: () => context.cFn() }
    },
  },
  loader: {
    handler: ({ params, context }) =>
      Promise.resolve({
        id: params.id,
        qc: context.queryClient,
        when: new Date(),
      }),
    dehydrate: ({ data, params }) => {
      expectTypeOf(data).toEqualTypeOf<{
        id: string
        qc: QueryClient
        when: Date
      }>()
      return { id: data.id + params.id, iso: data.when.toISOString() }
    },
    hydrate: ({ data, context }) => {
      expectTypeOf(data).toEqualTypeOf<Wire>()
      return { id: data.id, qc: context.queryClient, when: new Date(data.iso) }
    },
  },
})

const _codecBadRoute = createFileRoute('/codec-bad')({
  // @ts-expect-error the wire must be serializable
  loader: {
    handler: () => ({ id: 's' }),
    dehydrate: ({ data }) => ({ id: data.id, g: () => 2 }),
    hydrate: ({ data }) => ({ id: data.id }),
  },
})

test('codec: the wire is validated, the handler data is not', () => {
  expectTypeOf(codecRoute.types.loaderData).toEqualTypeOf<{
    id: string
    qc: QueryClient
    when: Date
  }>()
  expectTypeOf<Expand<typeof codecRoute.types.routeContext>>().toEqualTypeOf<{
    key: string
    cFn: () => number
    page: number
    bFn: () => number
  }>()
  expectTypeOf<
    RouteById<(typeof router)['routeTree'], '/codec/$id'>['types']['loaderData']
  >().toEqualTypeOf<{ id: string; qc: QueryClient; when: Date }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec-wire-bad',
    // @ts-expect-error the wire must be serializable
    context: {
      handler: () => ({ c: 1 }),
      dehydrate: ({ data }) => ({ c: data.c, fn: () => 1 }),
      hydrate: ({ data }) => ({ c: data.c }),
    },
  })
  // a hydrate returning a wider shape is not an error: loaderData is the union
  const wider = createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec-wider',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => ({ id: data.id }),
      hydrate: ({ data }) => ({ id: data.id }),
    },
  })
  expectTypeOf(wider.types.loaderData).toEqualTypeOf<
    { id: string; when: Date } | { id: string }
  >()
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec-unpaired',
    // @ts-expect-error a dehydrate function requires hydrate
    context: {
      handler: () => ({ c: 1 }),
      dehydrate: ({ data }) => ({ c: data.c }),
    },
    // @ts-expect-error a dehydrate function requires hydrate
    loader: {
      handler: () => Promise.resolve({ id: 's' }),
      dehydrate: ({ data }) => ({ id: data.id }),
    },
  })
})

test('codec: context-sensitive handler with inline, annotated and named halves', () => {
  const toWire = ({ data }: { data: Report }): Wire => ({
    id: data.id,
    iso: data.when.toISOString(),
  })
  const fromWire = ({ data }: { data: Wire }): Report => ({
    id: data.id,
    when: new Date(data.iso),
    format: (v) => `${v}`,
  })
  const fetchReport = (ctx: { context: { rootBl: string } }): Report => ({
    id: ctx.context.rootBl,
    when: new Date(),
    format: (v) => `${v}`,
  })

  const inline = createRoute({
    getParentRoute: () => rootRoute,
    path: 'inline',
    loader: {
      handler: ({ context }): Report => ({
        id: context.rootBl,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => ({
        id: data.id,
        when: new Date(data.iso),
        format: (v: number) => `${v}`,
      }),
    },
  })
  const annotatedHydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'annotated',
    loader: {
      handler: ({ context }): Report => ({
        id: context.rootBl,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }: { data: Wire }) => ({
        id: data.id,
        when: new Date(data.iso),
        format: (v: number) => `${v}`,
      }),
    },
  })
  const named = createRoute({
    getParentRoute: () => rootRoute,
    path: 'named',
    loader: {
      handler: ({ context }): Report => ({
        id: context.rootBl,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: toWire,
      hydrate: fromWire,
    },
  })
  const namedDehydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'named-dehydrate',
    loader: {
      handler: ({ context }): Report => ({
        id: context.rootBl,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: toWire,
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<Wire>()
        return {
          id: data.id,
          when: new Date(data.iso),
          format: (v: number) => `${v}`,
        }
      },
    },
  })
  const namedHydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'named-hydrate',
    loader: {
      handler: ({ context }): Report => ({
        id: context.rootBl,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: fromWire,
    },
  })
  const namedHandler = createRoute({
    getParentRoute: () => rootRoute,
    path: 'named-handler',
    loader: {
      handler: fetchReport,
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: fromWire,
    },
  })
  const allNamed = createRoute({
    getParentRoute: () => rootRoute,
    path: 'all-named',
    loader: { handler: fetchReport, dehydrate: toWire, hydrate: fromWire },
  })

  expectTypeOf(inline.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(annotatedHydrate.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(named.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(namedDehydrate.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(namedHydrate.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(namedHandler.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(allNamed.types.loaderData).toEqualTypeOf<Report>()
})

test('handlers by reference are validated like inline ones', () => {
  const loadPlain = (ctx: { params: { id: string } }) => ({
    id: ctx.params.id,
    when: new Date(),
  })
  const loadReport = (): Promise<Report> =>
    Promise.resolve({
      id: 's',
      when: new Date(),
      format: (v: number) => `${v}`,
    })

  const ok = createRoute({
    getParentRoute: () => rootRoute,
    path: 'by-ref/$id',
    loader: loadPlain,
  })
  expectTypeOf(ok.types.loaderData).toEqualTypeOf<{ id: string; when: Date }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'by-ref-bad',
    // @ts-expect-error Report.format is a function
    loader: loadReport,
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'by-ref-object-bad',
    loader: {
      // @ts-expect-error Report.format is a function
      handler: loadReport,
      staleReloadMode: 'blocking',
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'by-ref-codec',
    loader: {
      handler: loadReport,
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => ({
        id: data.id,
        when: new Date(data.iso),
        format: (v: number) => `${v}`,
      }),
    },
  })
})

// ---------------------------------------------------------------------------
// revalidate, async handlers, unions
// ---------------------------------------------------------------------------

test('revalidate: typed prev, wrong shape rejected, context only', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'revalidate/$id',
    context: {
      handler: ({ params }) => ({ id: params.id, n: 0 }),
      revalidate: ({ prev, params }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { id: string; n: number } | undefined
        >()
        return { id: prev?.id ?? params.id, n: (prev?.n ?? 0) + 1 }
      },
    },
  })
  expectTypeOf(route.types.routeContext).toEqualTypeOf<{
    id: string
    n: number
  }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'revalidate-bad',
    context: {
      handler: () => ({ id: 's', n: 0 }),
      // @ts-expect-error revalidate drops `n`
      revalidate: ({ prev }) => ({ id: prev?.id ?? 'x' }),
    },
    beforeLoad: {
      handler: () => ({ b: 1 }),
      // @ts-expect-error revalidate exists on context only
      revalidate: true,
    },
    loader: {
      handler: () => ({ l: 1 }),
      // @ts-expect-error revalidate exists on context only
      revalidate: true,
    },
  })
})

test('async handlers are awaited everywhere', () => {
  const parent = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async',
    context: {
      handler: async ({ context }) => ({
        c: await context.queryClient.fetch('k'),
      }),
      dehydrate: true,
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ c: string }>()
        return data
      },
    },
    beforeLoad: ({ context }) => Promise.resolve({ b: context.c.length }),
    loader: ({ context }) => Promise.resolve({ l: context.b }),
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    context: ({ context }) => {
      expectTypeOf(context.c).toEqualTypeOf<string>()
      expectTypeOf(context.b).toEqualTypeOf<number>()
      return { cc: context.b }
    },
  })

  expectTypeOf(parent.types.loaderData).toEqualTypeOf<{ l: number }>()
  expectTypeOf<Expand<typeof child.types.allContext>>().toEqualTypeOf<{
    queryClient: QueryClient
    user: string
    rootCtx: number
    rootBl: string
    c: string
    b: number
    cc: number
  }>()
  expectTypeOf(child).toMatchTypeOf<AnyRoute>()
})

test('union handler results and union wires', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'union/$id',
    loader: {
      handler: ({ params }) =>
        params.id === 'a'
          ? { kind: 'a' as const, a: 1 }
          : { kind: 'b' as const, b: 'x' },
      dehydrate: ({ data }) =>
        data.kind === 'a'
          ? { t: 'A' as const, n: data.a }
          : { t: 'B' as const, s: data.b },
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<
          | { t: 'A'; n: number; s?: undefined }
          | { t: 'B'; s: string; n?: undefined }
        >()
        return data.t === 'A'
          ? { kind: 'a' as const, a: data.n }
          : { kind: 'b' as const, b: data.s }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<
    | { kind: 'a'; a: number; b?: undefined }
    | { kind: 'b'; b: string; a?: undefined }
  >()
})

// ---------------------------------------------------------------------------
// always-throw handlers, typos, boolean dehydrate, literal widening
// ---------------------------------------------------------------------------

test('sync always-throw handlers keep the route assignable to AnyRoute', () => {
  const fnForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'throw-fn',
    beforeLoad: () => {
      throw redirect({ to: '/' })
    },
    loader: () => {
      throw notFound()
    },
  })
  const objectForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'throw-object',
    beforeLoad: {
      handler: () => {
        throw redirect({ to: '/' })
      },
      dehydrate: true,
    },
    loader: {
      handler: () => {
        throw notFound()
      },
      staleReloadMode: 'background',
    },
  })

  expectTypeOf(fnForm).toMatchTypeOf<AnyRoute>()
  expectTypeOf(objectForm).toMatchTypeOf<AnyRoute>()
})

test('a returned redirect or notFound is control flow, not data to validate', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'return-control',
    beforeLoad: () => {
      if (flag) return redirect({ to: '/' })
      return { b: 1 }
    },
    loader: async () => {
      if (flag) return notFound()
      return { l: await Promise.resolve(1) }
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'return-control-only',
    beforeLoad: () => redirect({ to: '/' }),
    loader: () => notFound(),
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'return-control-object',
    beforeLoad: { handler: () => redirect({ to: '/' }) },
    loader: {
      handler: () => {
        if (flag) return notFound()
        return { l: 1 }
      },
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'return-control-invalid',
    // @ts-expect-error the data next to a returned notFound is still validated
    loader: () => {
      if (flag) return notFound()
      return { format: (v: number) => `${v}` }
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<
    NotFoundError | { l: number }
  >()
})

test('a registered file-route context redirect preserves successful data inference', () => {
  expectTypeOf(contextRedirectRoute).not.toBeAny()
  expectTypeOf(contextRedirectRoute.types.routeContext).toEqualTypeOf<{
    session: string
  }>()
  expectTypeOf(contextRedirectRoute.types.loaderData).toEqualTypeOf<string>()
})

test('returned context redirects leave only successful data in context and codecs', () => {
  const functionForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-return-function',
    context: () => {
      if (flag) {
        return redirect({ to: '/' })
      }
      return { session: 'user' }
    },
    beforeLoad: ({ context }) => {
      expectTypeOf(context.session).toEqualTypeOf<string>()
    },
    loader: ({ context }) => context.session,
  })
  const transported = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-return-transported',
    context: {
      handler: async () => {
        if (flag) {
          return redirect({ to: '/' })
        }
        return { session: 'user' }
      },
      dehydrate: true,
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ session: string }>()
        return data
      },
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<{ session: string } | undefined>()
        return { session: 'next' }
      },
    },
    beforeLoad: ({ context }) => {
      expectTypeOf(context.session).toEqualTypeOf<string>()
    },
  })
  const codec = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-return-codec',
    context: {
      handler: () => {
        if (flag) {
          return redirect({ to: '/' })
        }
        return { session: 'user', format: () => 'user' }
      },
      dehydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{
          session: string
          format: () => string
        }>()
        return { session: data.session }
      },
      hydrate: ({ data }) => ({ ...data, format: () => data.session }),
    },
    loader: ({ context }) => context.format(),
  })
  const alwaysRedirect = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-return-always',
    context: {
      handler: () => redirect({ to: '/' }),
      dehydrate: true,
    },
  })
  const alwaysThrow = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-throw-always',
    context: {
      handler: () => {
        throw redirect({ to: '/' })
      },
      dehydrate: true,
    },
  })

  expectTypeOf(functionForm.types.routeContext).toEqualTypeOf<{
    session: string
  }>()
  expectTypeOf(transported.types.routeContext).toEqualTypeOf<{
    session: string
  }>()
  expectTypeOf(codec.types.loaderData).toEqualTypeOf<string>()
  expectTypeOf(alwaysRedirect).toMatchTypeOf<AnyRoute>()
  expectTypeOf(alwaysThrow).toMatchTypeOf<AnyRoute>()
})

test('a registered file-route context revalidation can return a redirect while prev remains successful data', () => {
  expectTypeOf(contextRevalidateRedirectRoute).not.toBeAny()
  expectTypeOf(
    contextRevalidateRedirectRoute.types.routeContext,
  ).toEqualTypeOf<{
    session: string
  }>()
  expectTypeOf(
    contextRevalidateRedirectRoute.types.loaderData,
  ).toEqualTypeOf<string>()
})

test('throwing notFound from context preserves successful data inference', () => {
  const functionForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-throw-not-found-function',
    context: () => {
      if (flag) {
        throw notFound()
      }
      return { session: 'user' }
    },
    loader: ({ context }) => context.session,
  })
  const transported = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-throw-not-found-transported',
    context: {
      handler: async () => {
        if (flag) {
          throw notFound()
        }
        return { session: 'user' }
      },
      dehydrate: true,
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ session: string }>()
        return data
      },
    },
    loader: ({ context }) => context.session,
  })
  expectTypeOf(functionForm.types.routeContext).toEqualTypeOf<{
    session: string
  }>()
  expectTypeOf(functionForm.types.loaderData).toEqualTypeOf<string>()
  expectTypeOf(transported.types.routeContext).toEqualTypeOf<{
    session: string
  }>()
  expectTypeOf(transported.types.loaderData).toEqualTypeOf<string>()
})

test('context redirect unions still validate transported data', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-return-invalid',
    // @ts-expect-error data beside a returned redirect must be serializable
    context: {
      handler: () => {
        if (flag) {
          return redirect({ to: '/' })
        }
        return { format: () => 'user' }
      },
      dehydrate: true,
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-return-not-found-data',
    // @ts-expect-error returned not-found objects are ordinary context data
    context: {
      handler: () => notFound({ data: () => 'user' }),
      dehydrate: true,
    },
  })
})

test('typo keys are rejected', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'typos',
    beforeLoad: {
      handler: () => ({ b: 1 }),
      // @ts-expect-error staleReloadMode exists on loader only
      staleReloadMode: 'blocking',
    },
    loader: {
      handler: () => ({ l: 1 }),
      // @ts-expect-error typo
      dehydrat: false,
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'handle',
    // @ts-expect-error `handle` is not `handler`
    loader: { handle: () => ({ l: 1 }) },
  })
})

test('a boolean-typed dehydrate is validated as if it were true', () => {
  const ok = createRoute({
    getParentRoute: () => rootRoute,
    path: 'flag-ok',
    context: { handler: () => ({ c: 1 }), dehydrate: flag },
    loader: { handler: () => ({ l: 1 }), dehydrate: flag },
  })
  expectTypeOf(ok.types.loaderData).toEqualTypeOf<{ l: number }>()
  expectTypeOf<Expand<typeof ok.types.routeContext>>().toEqualTypeOf<{
    c: number
  }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'flag-bad',
    // @ts-expect-error validated as transported
    context: { handler: () => ({ c: 1, cFn: () => 1 }), dehydrate: flag },
    // @ts-expect-error validated as transported
    loader: { handler: () => ({ l: 1, lFn: () => 1 }), dehydrate: flag },
  })
})

test('nested literal returns are widened', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'literals',
    beforeLoad: { handler: () => 'bx', dehydrate: true, hydrate: () => 'by' },
    loader: {
      handler: () => ({ kind: 'a' as const, n: 1 }),
      dehydrate: true,
      hydrate: ({ data }) => ({ kind: data.kind, n: 2 }),
    },
  })

  expectTypeOf(route.types.routeContext).toEqualTypeOf<string>()
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ kind: 'a'; n: number }>()
})

// ---------------------------------------------------------------------------
// selective SSR gates
// ---------------------------------------------------------------------------

const noSsrRoute = createFileRoute('/nossr')({ ssr: false })

const noSsrChildRoute = createFileRoute('/nossr/child')({
  context: { handler: () => ({ cFn: () => 1 }), dehydrate: true },
  beforeLoad: ({ context }) => ({ bFn: () => context.cFn() }),
  loader: {
    handler: ({ context }) => ({ fn: () => context.bFn() }),
    dehydrate: ({ data }) => ({ wFn: data.fn }),
    hydrate: ({ data }) => ({ fn: data.wFn }),
  },
})

test('below ssr: false nothing is validated; data-only still is', () => {
  expectTypeOf(noSsrChildRoute.types.loaderData).toEqualTypeOf<{
    fn: () => number
  }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'own-ssr-false',
    ssr: false,
    loader: {
      handler: () => ({ n: 1 }),
      dehydrate: ({ data }) => ({ n: data.n, fn: () => 1 }),
      hydrate: ({ data }) => ({ n: data.n }),
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'data-only',
    ssr: 'data-only',
    // @ts-expect-error data-only still transports the loader result
    loader: { handler: () => ({ fn: () => 1 }) },
  })
})

// ---------------------------------------------------------------------------
// parent object forms visible in the child, root routes, code-based routes
// ---------------------------------------------------------------------------

const parentRoute = createFileRoute('/parent')({
  context: { handler: () => ({ pc: 1 }), revalidate: true },
  beforeLoad: { handler: () => Promise.resolve({ pb: 's' }), dehydrate: true },
})

const childRoute = createFileRoute('/parent/child')({
  context: ({ context }) => ({ cc: context.pc + context.pb.length }),
  beforeLoad: ({ context }) => ({ cb: context.cc }),
  loader: ({ context }) => ({ l: context.cb }),
})

test('object-form context and beforeLoad of a parent are visible in the child', () => {
  expectTypeOf<Expand<typeof childRoute.types.allContext>>().toEqualTypeOf<{
    queryClient: QueryClient
    user: string
    rootCtx: number
    rootBl: string
    pc: number
    pb: string
    cc: number
    cb: number
  }>()
})

test('root routes are validated', () => {
  createRootRouteWithContext<{ user: string }>()({
    // @ts-expect-error a transported beforeLoad result must be serializable
    beforeLoad: () => ({ fn: () => 1 }),
  })
})

test('code-based createRoute is validated like file routes', () => {
  const ok = createRoute({
    getParentRoute: () => rootRoute,
    path: 'code/$id',
    loader: {
      handler: ({ params }) => ({ id: params.id, fn: () => 1 }),
      dehydrate: ({ data }) => ({ id: data.id }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ id: string }>()
        return { id: data.id, fn: () => 1 }
      },
    },
  })
  expectTypeOf(ok.types.loaderData).toEqualTypeOf<{
    id: string
    fn: () => number
  }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'code-bad',
    // @ts-expect-error a transported loader result must be serializable
    loader: () => ({ fn: () => 1 }),
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'code-bad-object',
    loader: {
      handler: () => ({
        id: 1,
        // @ts-expect-error a transported loader result must be serializable
        fn: () => 1,
      }),
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'code-bad-wire',
    // @ts-expect-error the wire must be serializable
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: ({ data }) => ({ id: data.id, g: () => 2 }),
      hydrate: ({ data }) => ({ id: data.id }),
    },
  })
})

// ---------------------------------------------------------------------------
// method shorthand, void handlers, explicit undefined keys
// ---------------------------------------------------------------------------

test('method shorthand for handler, dehydrate and hydrate', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'shorthand',
    beforeLoad: {
      handler({ context }) {
        return Promise.resolve({ bl: context.rootBl })
      },
      dehydrate: false,
    },
    loader: {
      handler({ context }) {
        return { id: context.bl, when: new Date() }
      },
      dehydrate({ data }) {
        expectTypeOf(data).toEqualTypeOf<{ id: string; when: Date }>()
        return { id: data.id, iso: data.when.toISOString() }
      },
      hydrate({ data }) {
        expectTypeOf(data).toEqualTypeOf<Wire>()
        return { id: data.id, when: new Date(data.iso) }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf(route.types.routeContext).toEqualTypeOf<{ bl: string }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'shorthand-bad',
    // @ts-expect-error the wire must be serializable
    loader: {
      handler() {
        return { id: 's' }
      },
      dehydrate({ data }) {
        return { id: data.id, g: () => 2 }
      },
      hydrate({ data }) {
        return { id: data.id }
      },
    },
  })
})

test('void and undefined-returning handlers with and without hydrate', () => {
  const plain = createRoute({
    getParentRoute: () => rootRoute,
    path: 'void',
    beforeLoad: { handler: () => Promise.resolve() },
    loader: {
      handler: () => {
        // nothing to return
      },
    },
  })
  const withHydrate = createRoute({
    getParentRoute: () => plain,
    path: 'hydrate',
    beforeLoad: {
      handler: () => Promise.resolve(),
      dehydrate: true,
      hydrate: () => {
        // nothing to restore
      },
    },
    loader: {
      handler: () => Promise.resolve(),
      dehydrate: true,
      hydrate: () => undefined,
    },
  })
  const child = createRoute({
    getParentRoute: () => withHydrate,
    path: 'child',
    context: ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<{
        queryClient: QueryClient
        user: string
        rootCtx: number
        rootBl: string
      }>()
      return { seen: true }
    },
  })

  expectTypeOf(plain.types.loaderData).toEqualTypeOf<void>()
  expectTypeOf(withHydrate.types.loaderData).toEqualTypeOf<void>()
  expectTypeOf<Expand<typeof child.types.allContext>>().toEqualTypeOf<{
    queryClient: QueryClient
    user: string
    rootCtx: number
    rootBl: string
    seen: boolean
  }>()
  expectTypeOf(child).toMatchTypeOf<AnyRoute>()
})

test('an explicit dehydrate: undefined is still validated', () => {
  const ok = createRoute({
    getParentRoute: () => rootRoute,
    path: 'dehydrate-undefined',
    loader: { handler: () => ({ id: 's' }), dehydrate: undefined },
  })
  expectTypeOf(ok.types.loaderData).toEqualTypeOf<{ id: string }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'dehydrate-undefined-bad',
    // @ts-expect-error a transported loader result must be serializable
    loader: { handler: () => ({ id: 's', fn: () => 1 }), dehydrate: undefined },
  })
})

test('an explicit hydrate: undefined next to a dehydrate function is rejected', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrate-undefined',
    // @ts-expect-error a dehydrate function requires hydrate
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: () => ({ id: 's' }),
      hydrate: undefined,
    },
  })
})

// ---------------------------------------------------------------------------
// shared codecs, generic handlers, any wires, revalidate next to a codec
// ---------------------------------------------------------------------------

test('a shared codec object spread into the object form', () => {
  const reportCodec = {
    dehydrate: ({ data }: { data: Report }): Wire => ({
      id: data.id,
      iso: data.when.toISOString(),
    }),
    hydrate: ({ data }: { data: Wire }): Report => ({
      id: data.id,
      when: new Date(data.iso),
      format: (v) => `${v}`,
    }),
  }

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'spread-codec',
    loader: {
      handler: ({ context }): Report => ({
        id: context.rootBl,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      ...reportCodec,
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<Report>()
})

test('a generic handler passed by reference', () => {
  function genericHandler<T extends { context: { rootBl: string } }>(ctx: T) {
    return { g: ctx.context.rootBl }
  }

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'generic',
    beforeLoad: genericHandler,
    loader: { handler: genericHandler, dehydrate: false },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ g: string }>()
  expectTypeOf(route.types.routeContext).toEqualTypeOf<{ g: string }>()
})

test('a context typed with the 5-argument RouteContextOptions keeps the route validated', () => {
  const sharedContext = (
    ctx: RouteContextOptions<any, any, any, any, any>,
  ) => ({
    cause: ctx.cause,
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'shared-context',
    context: sharedContext,
    // @ts-expect-error a function is not serializable
    loader: () => ({ fn: () => 1 }),
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'shared-context-handler',
    context: { handler: sharedContext },
    // @ts-expect-error a function is not serializable
    beforeLoad: () => ({ fn: () => 1 }),
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'shared-context-transported',
    // @ts-expect-error the transported context result holds a function
    context: {
      handler: (ctx: RouteContextOptions<any, any, any, any, any>) => ({
        fn: () => ctx.cause,
      }),
      dehydrate: true,
    },
  })
})

test('an any-typed wire gives hydrate an any data and passes validation', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'any-wire',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => JSON.parse(JSON.stringify(data)),
      hydrate: ({ data }) => {
        expectTypeOf(data).toBeAny()
        return { id: 's', when: new Date() }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
})

test('an unknown-typed wire is rejected like an unknown handler result, sync or async', () => {
  const encode = (value: unknown): unknown => JSON.stringify(value)
  const encodeAsync = (value: unknown): Promise<unknown> =>
    Promise.resolve(JSON.stringify(value))

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'unknown-wire',
    // @ts-expect-error a wire typed `unknown` may not be serializable
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => encode(data),
      hydrate: ({ data }) => {
        expectTypeOf(data).toBeUnknown()
        return { id: String(data), when: new Date() }
      },
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'unknown-wire-async',
    // @ts-expect-error a wire typed `unknown` may not be serializable
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => encodeAsync(data),
      hydrate: ({ data }) => {
        expectTypeOf(data).toBeUnknown()
        return { id: String(data), when: new Date() }
      },
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'unknown-wire-hydrate-first',
    // @ts-expect-error hydrate written before dehydrate: the wire is inferred from dehydrate
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      hydrate: ({ data }) => ({ id: String(data), when: new Date() }),
      dehydrate: ({ data }) => encode(data),
    },
  })
})

test('revalidate next to a codec: the wire is validated, prev is the handler data', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec-revalidate',
    context: {
      handler: ({ context }) => ({ session: context.user, fn: () => 1 }),
      dehydrate: ({ data }) => ({ session: data.session }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ session: string }>()
        return { session: data.session, fn: () => 2 }
      },
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { session: string; fn: () => number } | undefined
        >()
        return { session: prev?.session ?? '', fn: () => 3 }
      },
    },
  })
  expectTypeOf(route.types.routeContext).toEqualTypeOf<{
    session: string
    fn: () => number
  }>()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec-revalidate-bad',
    // @ts-expect-error the wire must be serializable
    context: {
      handler: () => ({ session: 's', fn: () => 1 }),
      dehydrate: ({ data }) => ({ session: data.session, fn: data.fn }),
      hydrate: ({ data }) => ({ session: data.session, fn: data.fn }),
      revalidate: true,
    },
  })
})

// ---------------------------------------------------------------------------
// code-based routes inside the registered tree: Register.router is the
// real tree, so the hooks resolve the codec route's types through it
// ---------------------------------------------------------------------------

const codeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'code/$id',
  context: {
    handler: ({ params }) => ({ codeKey: params.id, codeFn: () => 1 }),
    revalidate: true,
  },
  loader: {
    handler: ({ params, context }) => ({
      id: params.id,
      qc: context.queryClient,
      when: new Date(),
    }),
    dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
    hydrate: ({ data, context }) => {
      expectTypeOf(data).toEqualTypeOf<Wire>()
      return { id: data.id, qc: context.queryClient, when: new Date(data.iso) }
    },
  },
})

const codeBadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: 'code-bad',
  // @ts-expect-error a transported loader result must be serializable
  loader: () => ({ fn: () => 1 }),
})

type CodeLoaderData = { id: string; qc: QueryClient; when: Date }
type CodeContext = {
  queryClient: QueryClient
  user: string
  rootCtx: number
  rootBl: string
  codeKey: string
  codeFn: () => number
}

function useCodeRouteTypes() {
  const api = getRouteApi('/code/$id')
  return [
    useLoaderData({
      from: '/code/$id',
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<CodeLoaderData>()
        return data.id
      },
    }),
    useRouteContext({
      from: '/code/$id',
      select: (context) => {
        expectTypeOf<Expand<typeof context>>().toEqualTypeOf<CodeContext>()
        return context.codeKey
      },
    }),
    api.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<CodeLoaderData>()
        return data.id
      },
    }),
    api.useRouteContext({
      select: (context) => {
        expectTypeOf<Expand<typeof context>>().toEqualTypeOf<CodeContext>()
        return context.codeFn()
      },
    }),
  ]
}

test('code-based routes in the registered tree resolve through the hooks', () => {
  expectTypeOf(codeRoute.types.loaderData).toEqualTypeOf<CodeLoaderData>()
  expectTypeOf<
    RouteById<(typeof router)['routeTree'], '/code/$id'>['types']['loaderData']
  >().toEqualTypeOf<CodeLoaderData>()
  expectTypeOf<
    Expand<
      RouteById<
        (typeof router)['routeTree'],
        '/code/$id'
      >['types']['allContext']
    >
  >().toEqualTypeOf<CodeContext>()
  expectTypeOf(useCodeRouteTypes).toBeFunction()
})

// ---------------------------------------------------------------------------
// hydrate requires dehydrate (true or a function)
// ---------------------------------------------------------------------------

test('hydrate without a dehydrate key is rejected on all three lifecycles', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'no-dehydrate',
    // @ts-expect-error hydrate requires dehydrate: true or a dehydrate function
    context: {
      handler: () => ({ c: 1 }),
      hydrate: ({ data }) => data,
    },
    // @ts-expect-error hydrate requires dehydrate: true or a dehydrate function
    beforeLoad: {
      handler: () => ({ b: 1 }),
      hydrate: ({ data }) => data,
    },
    // @ts-expect-error hydrate requires dehydrate: true or a dehydrate function
    loader: {
      handler: () => ({ l: 1 }),
      hydrate: ({ data }) => data,
    },
  })
})

test('hydrate next to dehydrate: false is rejected on all three lifecycles', () => {
  // parameter-less hydrates keep each pin to one error: with `dehydrate: false`
  // the matching arm has `hydrate?: undefined`, so a destructured parameter gets
  // no contextual type and reports an implicit `any` next to the key error
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'dehydrate-false-hydrate',
    // @ts-expect-error hydrate is not allowed with dehydrate: false
    context: {
      handler: () => ({ c: 1 }),
      dehydrate: false,
      hydrate: () => ({ c: 2 }),
    },
    // @ts-expect-error hydrate is not allowed with dehydrate: false
    beforeLoad: {
      handler: () => ({ b: 1 }),
      dehydrate: false,
      hydrate: () => ({ b: 2 }),
    },
    // @ts-expect-error hydrate is not allowed with dehydrate: false
    loader: {
      handler: () => ({ l: 1 }),
      dehydrate: false,
      hydrate: () => ({ l: 2 }),
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'dehydrate-false-hydrate-destructured',
    // @ts-expect-error hydrate is not allowed with dehydrate: false
    loader: {
      handler: () => ({ l: 1 }),
      dehydrate: false,
      // @ts-expect-error `data` has no contextual type here (documented limitation)
      hydrate: ({ data }) => data,
    },
  })

  // an explicit `hydrate: undefined` types like an omitted key
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrate-undefined-ok',
    context: {
      handler: () => ({ c: 1 }),
      dehydrate: false,
      hydrate: undefined,
    },
    loader: { handler: () => ({ l: 1 }), hydrate: undefined },
  })
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ l: number }>()
  expectTypeOf(route.types.routeContext).toEqualTypeOf<{ c: number }>()
})

// ---------------------------------------------------------------------------
// async dehydrate and hydrate
// ---------------------------------------------------------------------------

test('async dehydrate and hydrate: the awaited values are used everywhere', () => {
  const asyncDehydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-dehydrate',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) =>
        Promise.resolve({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<Wire>()
        return { id: data.id, when: new Date(data.iso) }
      },
    },
  })
  const asyncHydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-hydrate',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<Wire>()
        return Promise.resolve({ id: data.id, when: new Date(data.iso) })
      },
    },
  })
  const bothAsync = createRoute({
    getParentRoute: () => rootRoute,
    path: 'both-async',
    context: {
      handler: () => Promise.resolve({ id: 's', when: new Date() }),
      dehydrate: ({ data }) =>
        Promise.resolve({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<Wire>()
        return Promise.resolve({ id: data.id, when: new Date(data.iso) })
      },
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { id: string; when: Date } | undefined
        >()
        return { id: prev?.id ?? '', when: new Date() }
      },
    },
  })
  const toWireAsync = ({ data }: { data: Report }): Promise<Wire> =>
    Promise.resolve({ id: data.id, iso: data.when.toISOString() })
  const fromWireAsync = ({ data }: { data: Wire }): Promise<Report> =>
    Promise.resolve({
      id: data.id,
      when: new Date(data.iso),
      format: (v) => `${v}`,
    })
  const byReference = createRoute({
    getParentRoute: () => rootRoute,
    path: 'by-reference-async',
    loader: {
      handler: (): Promise<Report> =>
        Promise.resolve({ id: 's', when: new Date(), format: (v) => `${v}` }),
      dehydrate: toWireAsync,
      hydrate: fromWireAsync,
    },
  })

  expectTypeOf(asyncDehydrate.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf(asyncHydrate.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf(bothAsync.types.routeContext).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf(byReference.types.loaderData).toEqualTypeOf<Report>()
})

test('an async dehydrate returning Promise<A | B> keeps the union in hydrate', () => {
  type WA = { t: 1; a: number }
  type WB = { t: 2; b: string }
  type Data = { k: 'a'; a: number } | { k: 'b'; b: string }
  const toWireUnion = (ctx: { data: Data }): Promise<WA | WB> =>
    Promise.resolve(
      ctx.data.k === 'a' ? { t: 1, a: ctx.data.a } : { t: 2, b: ctx.data.b },
    )

  const inline = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-union-inline',
    loader: {
      handler: (): Data => ({ k: 'a', a: 1 }),
      dehydrate: ({ data }) =>
        Promise.resolve(
          data.k === 'a'
            ? { t: 1 as const, a: data.a }
            : { t: 2 as const, b: data.b },
        ),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<
          | { t: 1; a: number; b?: undefined }
          | { t: 2; b: string; a?: undefined }
        >()
        return data.t === 1
          ? { k: 'a' as const, a: data.a }
          : { k: 'b' as const, b: data.b }
      },
    },
  })
  const byReference = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-union-ref',
    loader: {
      handler: (): Data => ({ k: 'a', a: 1 }),
      dehydrate: toWireUnion,
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<WA | WB>()
        return data.t === 1
          ? { k: 'a' as const, a: data.a }
          : { k: 'b' as const, b: data.b }
      },
    },
  })

  expectTypeOf(inline.types.loaderData).toEqualTypeOf<Data>()
  expectTypeOf(byReference.types.loaderData).toEqualTypeOf<Data>()
})

test('an async wire holding a function is rejected in a Start register', () => {
  const badWireAsync = (ctx: {
    data: { id: string }
  }): Promise<{ id: string; g: () => number }> =>
    Promise.resolve({ id: ctx.data.id, g: () => 2 })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-wire-fn',
    // @ts-expect-error the awaited wire must be serializable
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: ({ data }) => Promise.resolve({ id: data.id, g: () => 2 }),
      hydrate: ({ data }) => ({ id: data.id }),
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-wire-fn-ref',
    // @ts-expect-error the awaited wire must be serializable
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: badWireAsync,
      hydrate: ({ data }) => ({ id: data.id }),
    },
  })
})

// ---------------------------------------------------------------------------
// hydrate may return a different type; the lifecycle data is the union
// ---------------------------------------------------------------------------

const hydratedRoute = createFileRoute('/hydrated')({
  loader: {
    handler: async () => ({
      hydrated: false as const,
      stats: await fetchStats(),
    }),
    dehydrate: ({ data }) => ({ stats: data.stats }),
    // `as const` on both sides: without it the discriminant widens to `boolean`
    hydrate: async ({ data }) => ({
      hydrated: true as const,
      stats: data.stats,
      prefs: await readPrefs(),
    }),
  },
})

// assertions live inside `select` so the file stays identical across react, solid
// and vue (vue's hooks return a Ref)
function useHydratedRouteTypes() {
  return [
    hydratedRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<StatsData>()
        if (data.hydrated) {
          expectTypeOf(data.prefs).toEqualTypeOf<Prefs>()
          return data.prefs.theme
        }
        expectTypeOf(data).toEqualTypeOf<{ hydrated: false; stats: Stats }>()
        expectTypeOf(data).not.toHaveProperty('prefs')
        return data.stats.views
      },
    }),
    useLoaderData({
      from: '/hydrated',
      select: (d) => {
        expectTypeOf(d).toEqualTypeOf<StatsData>()
        return d.hydrated
      },
    }),
  ]
}

test('loader: a hydrate returning a different shape yields a union that narrows on a discriminant', () => {
  expectTypeOf(hydratedRoute.types.loaderData).toEqualTypeOf<StatsData>()
  expectTypeOf<
    RouteById<(typeof router)['routeTree'], '/hydrated'>['types']['loaderData']
  >().toEqualTypeOf<StatsData>()
  expectTypeOf(useHydratedRouteTypes).toBeFunction()
})

test('context: the union is visible to beforeLoad, loader, the child and to revalidate prev', () => {
  const parent = createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrated-context',
    context: {
      handler: async () => ({
        hydrated: false as const,
        stats: await fetchStats(),
      }),
      dehydrate: ({ data }) => ({ stats: data.stats }),
      hydrate: async ({ data }) => ({
        hydrated: true as const,
        stats: data.stats,
        prefs: await readPrefs(),
      }),
      revalidate: ({ prev }) => {
        // prev is the resolved data: the handler shape or the hydrated shape
        expectTypeOf(prev).toEqualTypeOf<StatsData | undefined>()
        return { hydrated: false as const, stats: prev?.stats ?? { views: 0 } }
      },
    },
    beforeLoad: ({ context }) => {
      expectTypeOf(context.hydrated).toEqualTypeOf<boolean>()
      if (context.hydrated) {
        expectTypeOf(context.prefs).toEqualTypeOf<Prefs>()
      }
      return { fromBl: context.stats.views }
    },
    loader: ({ context }) => ({
      theme: context.hydrated ? context.prefs.theme : null,
    }),
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    context: ({ context }) => {
      expectTypeOf(context.hydrated).toEqualTypeOf<boolean>()
      if (context.hydrated) {
        expectTypeOf(context.prefs).toEqualTypeOf<Prefs>()
        return { child: context.prefs.theme }
      }
      return { child: `${context.fromBl}${context.user}` }
    },
  })

  expectTypeOf<Expand<typeof parent.types.routeContext>>().toEqualTypeOf<
    | { hydrated: false; stats: Stats; fromBl: number }
    | { hydrated: true; stats: Stats; prefs: Prefs; fromBl: number }
  >()
  expectTypeOf(parent.types.loaderData).toEqualTypeOf<{
    theme: 'dark' | 'light' | null
  }>()
  expectTypeOf(child.types.routeContext).toEqualTypeOf<{ child: string }>()
  expectTypeOf(child).toMatchTypeOf<AnyRoute>()
})

test('context: revalidate must return the handler shape even when hydrate widens the data', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'revalidate-prev',
    // @ts-expect-error prev may hold the hydrated shape, revalidate returns the handler shape
    context: {
      handler: async () => ({
        hydrated: false as const,
        stats: await fetchStats(),
      }),
      dehydrate: ({ data }) => ({ stats: data.stats }),
      hydrate: async ({ data }) => ({
        hydrated: true as const,
        stats: data.stats,
        prefs: await readPrefs(),
      }),
      revalidate: ({ prev }) => prev!,
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'revalidate-hydrated',
    // @ts-expect-error the hydrated shape is not the handler shape
    context: {
      handler: async () => ({
        hydrated: false as const,
        stats: await fetchStats(),
      }),
      dehydrate: ({ data }) => ({ stats: data.stats }),
      hydrate: async ({ data }) => ({
        hydrated: true as const,
        stats: data.stats,
        prefs: await readPrefs(),
      }),
      revalidate: async ({ prev }) => ({
        hydrated: true as const,
        stats: prev?.stats ?? { views: 0 },
        prefs: await readPrefs(),
      }),
    },
  })
})

test('a hydrate returning the handler shape, a subtype of it, or the handler shape plus an extra property leaves the types unchanged', () => {
  const loadReport = (): Promise<Report> =>
    Promise.resolve({ id: 'r', when: new Date(), format: (v) => `${v}` })

  const plain = createRoute({
    getParentRoute: () => rootRoute,
    path: 'reduce-plain',
    loader: { handler: loadReport, dehydrate: false },
  })
  const sameShape = createRoute({
    getParentRoute: () => rootRoute,
    path: 'reduce-same',
    loader: {
      handler: loadReport,
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => ({
        id: data.id,
        when: new Date(data.iso),
        format: (v: number) => `${v}`,
      }),
    },
  })
  const subtype = createRoute({
    getParentRoute: () => rootRoute,
    path: 'reduce-subtype',
    loader: {
      handler: () => ({ kind: flag ? ('a' as const) : ('b' as const), n: 1 }),
      dehydrate: true,
      hydrate: ({ data }) => ({ kind: 'a' as const, n: data.n }),
    },
  })
  // `{ id, extra }` is assignable to `{ id }`, so the slot keeps the handler data
  // and the extra property is not visible on loaderData
  const extraProperty = createRoute({
    getParentRoute: () => rootRoute,
    path: 'reduce-extra',
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: true,
      hydrate: ({ data }) => ({ id: data.id, extra: 1 }),
    },
  })

  expectTypeOf(sameShape.types.loaderData).toEqualTypeOf(plain.types.loaderData)
  expectTypeOf(sameShape.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(subtype.types.loaderData).toEqualTypeOf<{
    kind: 'a' | 'b'
    n: number
  }>()
  expectTypeOf(extraProperty.types.loaderData).toEqualTypeOf<{ id: string }>()
})

test('the `isServer` env form of combining server and client-only data reduces to the handler type: `prefs` is invisible unless the handler declares it (documented limitation)', () => {
  // the hydrate result `{ env: 'client'; stats; prefs }` is a subtype of the
  // handler data `{ env: 'server' | 'client'; stats }`, so the slot keeps the
  // handler data: no union, `prefs` is not visible and `env` narrows nothing
  const reduced = createRoute({
    getParentRoute: () => rootRoute,
    path: 'env-reduced',
    loader: {
      handler: async () => ({
        env: isServer ? ('server' as const) : ('client' as const),
        stats: await fetchStats(),
      }),
      dehydrate: ({ data }) => ({ stats: data.stats }),
      hydrate: async ({ data }) => ({
        env: 'client' as const,
        stats: data.stats,
        prefs: await readPrefs(),
      }),
    },
  })
  // declaring the client-only field in the handler (`undefined` there) keeps a
  // runtime `env` and makes the union visible; narrow on the field itself
  const declared = createRoute({
    getParentRoute: () => rootRoute,
    path: 'env-declared',
    loader: {
      handler: async () => ({
        env: isServer ? ('server' as const) : ('client' as const),
        stats: await fetchStats(),
        prefs: undefined,
      }),
      dehydrate: ({ data }) => ({ stats: data.stats }),
      hydrate: async ({ data }) => ({
        env: 'client' as const,
        stats: data.stats,
        prefs: await readPrefs(),
      }),
    },
  })

  expectTypeOf(reduced.types.loaderData).toEqualTypeOf<{
    env: 'server' | 'client'
    stats: Stats
  }>()
  const reducedData = {} as typeof reduced.types.loaderData
  if (reducedData.env === 'client') {
    expectTypeOf(reducedData).toEqualTypeOf<{
      env: 'server' | 'client'
      stats: Stats
    }>()
    expectTypeOf(reducedData).not.toHaveProperty('prefs')
  }
  if ('prefs' in reducedData) {
    expectTypeOf(reducedData.prefs).toEqualTypeOf<unknown>()
  }

  expectTypeOf(declared.types.loaderData).toEqualTypeOf<
    | { env: 'server' | 'client'; stats: Stats; prefs: undefined }
    | { env: 'client'; stats: Stats; prefs: Prefs }
  >()
  const declaredData = {} as typeof declared.types.loaderData
  if (declaredData.prefs) {
    expectTypeOf(declaredData.prefs).toEqualTypeOf<Prefs>()
  }
})

test('a literal discriminant in hydrate without `as const` widens to a second union member (documented limitation)', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'widened-literal',
    loader: {
      handler: () => ({ kind: 'a' as const, n: 1 }),
      dehydrate: ({ data }) => ({ n: data.n }),
      hydrate: ({ data }) => ({ kind: 'a', n: data.n }),
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<
    { kind: 'a'; n: number } | { kind: string; n: number }
  >()
})

test('a parameter-less hydrate next to an inline dehydrate is accepted', () => {
  const sameShape = createRoute({
    getParentRoute: () => rootRoute,
    path: 'paramless-same',
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: ({ data }) => ({ id: data.id }),
      hydrate: () => ({ id: 'client' }),
    },
  })
  const differentShape = createRoute({
    getParentRoute: () => rootRoute,
    path: 'paramless-different',
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: ({ data }) => ({ id: data.id }),
      hydrate: () => ({ env: 'client' as const }),
    },
  })

  expectTypeOf(sameShape.types.loaderData).toEqualTypeOf<{ id: string }>()
  expectTypeOf(differentShape.types.loaderData).toEqualTypeOf<
    { id: string } | { env: 'client' }
  >()
})

// ---------------------------------------------------------------------------
// tree + router (also the registered router: hydrate reading `data` must not
// cycle through Register.router)
// ---------------------------------------------------------------------------

const routeTree = rootRoute.addChildren([
  contextRedirectRoute,
  contextRevalidateRedirectRoute,
  fnRoute,
  handlerRoute,
  codecRoute,
  codeRoute,
  codeBadRoute,
  hydratedRoute,
  noSsrRoute.addChildren([noSsrChildRoute]),
  parentRoute.addChildren([childRoute]),
])

export const router = createRouter({
  routeTree,
  context: { queryClient: { fetch: () => Promise.resolve('') }, user: 'u' },
})
