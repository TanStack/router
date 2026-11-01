import { expectTypeOf, test } from 'vitest'
import {
  RootRoute,
  Route,
  createFileRoute,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  notFound,
  redirect,
} from '../src'
import type { AnyRoute } from '../src'
import type { Expand } from '@tanstack/router-core'

// Lifecycle option forms (`context`, `beforeLoad`, `loader` as a function or as
// `{ handler, dehydrate, hydrate, revalidate, staleReloadMode }`) in a plain SPA
// register: `Register` has no `ssr`, so results and wires are never checked for
// serializability and every form must compile. The validated counterpart lives in
// tests/start-register/lifecycle.test-d.tsx (its own tsc program, because the
// `Register` augmentation is global).

type Report = { id: string; when: Date; format: (v: number) => string }
type Wire = { id: string; iso: string }

// ---------------------------------------------------------------------------
// file routes (module level: FileRoutesByPath needs `typeof` the route)
// ---------------------------------------------------------------------------

const fileRootRoute = createRootRouteWithContext<{ user: string }>()({
  beforeLoad: ({ context }) => ({ rootBl: context.user }),
})

const codecFileRoute = createFileRoute('/lifecycle/codec/$id')({
  loader: {
    handler: ({ params, context }) => ({
      id: params.id,
      user: context.rootBl,
      when: new Date(),
    }),
    dehydrate: ({ data, params }) => {
      expectTypeOf(data).toEqualTypeOf<{
        id: string
        user: string
        when: Date
      }>()
      expectTypeOf(params).toEqualTypeOf<{ id: string }>()
      return { id: data.id, iso: data.when.toISOString() }
    },
    hydrate: ({ data, context }) => {
      expectTypeOf(data).toEqualTypeOf<{ id: string; iso: string }>()
      return { id: data.id, user: context.rootBl, when: new Date(data.iso) }
    },
  },
})

const _unpairedFileRoute = createFileRoute('/lifecycle/unpaired')({
  // @ts-expect-error a dehydrate function requires hydrate
  loader: {
    handler: () => ({ id: 's' }),
    dehydrate: ({ data }) => ({ id: data.id }),
  },
})

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/lifecycle/codec/$id': {
      id: '/lifecycle/codec/$id'
      path: '/lifecycle/codec/$id'
      fullPath: '/lifecycle/codec/$id'
      preLoaderRoute: typeof codecFileRoute
      parentRoute: typeof fileRootRoute
    }
    '/lifecycle/unpaired': {
      id: '/lifecycle/unpaired'
      path: '/lifecycle/unpaired'
      fullPath: '/lifecycle/unpaired'
      preLoaderRoute: typeof _unpairedFileRoute
      parentRoute: typeof fileRootRoute
    }
  }
}

test('createFileRoute threads the codec wire into hydrate', () => {
  expectTypeOf(codecFileRoute.types.loaderData).toEqualTypeOf<{
    id: string
    user: string
    when: Date
  }>()
  expectTypeOf(fileRootRoute.types.routeContext).toEqualTypeOf<{
    rootBl: string
  }>()
})

// ---------------------------------------------------------------------------
// function form
// ---------------------------------------------------------------------------

test('function form: results flow through ctx, loaderData and routeContext', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()({
    context: ({ context }) => ({ rootCtx: context.user.length }),
    beforeLoad: ({ context }) =>
      Promise.resolve({ rootBl: `${context.rootCtx}` }),
  })

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '$id',
    validateSearch: () => ({ page: 0 }),
    loaderDeps: ({ search }) => ({ page: search.page }),
    context: ({ context, params, deps }) => {
      expectTypeOf(context).toEqualTypeOf<{
        user: string
        rootCtx: number
        rootBl: string
      }>()
      expectTypeOf(params).toEqualTypeOf<{ id: string }>()
      expectTypeOf(deps).toEqualTypeOf<{ page: number }>()
      return { ctxValue: deps.page, ctxFn: () => context.rootCtx }
    },
    beforeLoad: ({ context, search }) => {
      expectTypeOf(context.ctxValue).toEqualTypeOf<number>()
      expectTypeOf(context.ctxFn).toEqualTypeOf<() => number>()
      return { bl: `${context.ctxValue}-${search.page}` }
    },
    loader: ({ context, deps }) =>
      Promise.resolve({
        items: [context.bl, context.rootBl],
        page: deps.page,
        when: new Date(),
        fn: () => context.ctxFn(),
      }),
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    items: Array<string>
    page: number
    when: Date
    fn: () => number
  }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    ctxValue: number
    ctxFn: () => number
    bl: string
  }>()
})

// ---------------------------------------------------------------------------
// { handler } object form
// ---------------------------------------------------------------------------

test('object form with only a handler types like the function form', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts',
    context: {
      handler: ({ context }) => ({ c: context.user, cFn: () => 1 }),
    },
    beforeLoad: {
      handler: ({ context }) =>
        Promise.resolve({ b: context.c.length + context.cFn() }),
    },
    loader: {
      handler: ({ context }) => ({ l: context.b, when: new Date() }),
      staleReloadMode: 'blocking',
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    l: number
    when: Date
  }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    c: string
    cFn: () => number
    b: number
  }>()
})

test('object form held in a const or returned by a helper keeps its handler type', () => {
  const rootRoute = createRootRoute()

  const plain = { handler: () => ({ n: 1 }) }
  const withMode = {
    handler: () => ({ n: 2 }),
    staleReloadMode: 'blocking' as const,
  }
  function makeLoader() {
    return {
      handler: (ctx: { params: { id: string } }) =>
        Promise.resolve({ id: ctx.params.id }),
      dehydrate: false as const,
    }
  }
  const codec = {
    handler: (ctx: { params: { id: string } }) =>
      Promise.resolve({ id: ctx.params.id, when: new Date() }),
    dehydrate: ({ data }: { data: { id: string; when: Date } }) => ({
      id: data.id,
      iso: data.when.toISOString(),
    }),
    hydrate: ({ data }: { data: Wire }) => ({
      id: data.id,
      when: new Date(data.iso),
    }),
  }
  const ctxOption = { handler: () => ({ user: 'u', n: 1 }) }

  const plainRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'plain',
    loader: plain,
  })
  const withModeRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'mode',
    loader: withMode,
  })
  const spreadRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'spread',
    loader: { ...withMode },
  })
  const helperRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'helper/$id',
    loader: makeLoader(),
  })
  const codecRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec/$id',
    loader: codec,
  })
  const ctxRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: 'ctx',
    context: ctxOption,
  })

  expectTypeOf(plainRoute.types.loaderData).toEqualTypeOf<{ n: number }>()
  expectTypeOf(withModeRoute.types.loaderData).toEqualTypeOf<{ n: number }>()
  expectTypeOf(spreadRoute.types.loaderData).toEqualTypeOf<{ n: number }>()
  expectTypeOf(helperRoute.types.loaderData).toEqualTypeOf<{ id: string }>()
  expectTypeOf(codecRoute.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf(ctxRoute.types.routeContext).toEqualTypeOf<{
    user: string
    n: number
  }>()
})

// ---------------------------------------------------------------------------
// dehydrate: false
// ---------------------------------------------------------------------------

test('dehydrate: false keeps functions in every lifecycle result', () => {
  const rootRoute = createRootRoute()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'local',
    context: { handler: () => ({ cFn: () => 1 }), dehydrate: false },
    beforeLoad: {
      handler: ({ context }) => ({ bFn: () => context.cFn() + 1 }),
      dehydrate: false,
    },
    loader: {
      handler: ({ context }) => ({ lFn: () => context.bFn() + 1 }),
      dehydrate: false,
      staleReloadMode: 'blocking',
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ lFn: () => number }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    cFn: () => number
    bFn: () => number
  }>()
})

// ---------------------------------------------------------------------------
// dehydrate: true + hydrate
// ---------------------------------------------------------------------------

test('dehydrate: true with hydrate: data is the full awaited value and ctx is typed', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()({
    beforeLoad: ({ context }) => ({ rootBl: context.user }),
  })

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '$id',
    loaderDeps: () => ({ n: 1 }),
    context: {
      handler: ({ params }) => ({ c: params.id }),
      dehydrate: true,
      hydrate: ({ data, params, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ c: string }>()
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        expectTypeOf(context.rootBl).toEqualTypeOf<string>()
        return { c: data.c + params.id + context.rootBl }
      },
    },
    beforeLoad: {
      handler: ({ context }) => Promise.resolve({ b: context.c.length }),
      dehydrate: true,
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ b: number }>()
        return { b: data.b + context.c.length }
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
        expectTypeOf(context.b).toEqualTypeOf<number>()
        return { id: data.id + params.id + context.b + deps.n, when: data.when }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    c: string
    b: number
  }>()
})

// ---------------------------------------------------------------------------
// codec: dehydrate function + hydrate
// ---------------------------------------------------------------------------

test('codecs infer route context and passive lifecycle metadata', () => {
  const rootRoute = createRootRouteWithContext<{ locale: string }>()({})
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'passive/$id',
    validateSearch: (search: Record<string, unknown>) => ({
      page: Number(search.page ?? 1),
    }),
    loaderDeps: ({ search }) => ({ page: search.page }),
    beforeLoad: {
      handler: ({ context, search }) => ({
        prefix: `${context.locale}:${search.page}`,
      }),
      dehydrate: ({ data, context, search, routeId }) => {
        expectTypeOf(data).toEqualTypeOf<{ prefix: string }>()
        expectTypeOf(context).toEqualTypeOf<{ locale: string }>()
        expectTypeOf(search).toEqualTypeOf<{ page: number }>()
        expectTypeOf(routeId).toEqualTypeOf<'/passive/$id'>()
        return data.prefix
      },
      hydrate: ({ data, context, search, routeId }) => {
        expectTypeOf(data).toEqualTypeOf<string>()
        expectTypeOf(context).toEqualTypeOf<{ locale: string }>()
        expectTypeOf(search).toEqualTypeOf<{ page: number }>()
        expectTypeOf(routeId).toEqualTypeOf<'/passive/$id'>()
        return { prefix: data }
      },
    },
    loader: {
      handler: ({ params, context, deps }) => ({
        id: params.id,
        label: context.prefix,
        page: deps.page,
      }),
      dehydrate: ({ data, context, params, deps, route: matchedRoute }) => {
        expectTypeOf(data).toEqualTypeOf<{
          id: string
          label: string
          page: number
        }>()
        expectTypeOf(context).toEqualTypeOf<{
          locale: string
          prefix: string
        }>()
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        expectTypeOf(deps).toEqualTypeOf<{ page: number }>()
        expectTypeOf(matchedRoute).toEqualTypeOf<AnyRoute>()
        return data.id
      },
      hydrate: ({ data, context, params, deps, route: matchedRoute }) => {
        expectTypeOf(data).toEqualTypeOf<string>()
        expectTypeOf(context).toEqualTypeOf<{
          locale: string
          prefix: string
        }>()
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        expectTypeOf(deps).toEqualTypeOf<{ page: number }>()
        expectTypeOf(matchedRoute).toEqualTypeOf<AnyRoute>()
        return { id: data, label: context.prefix, page: deps.page }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    label: string
    page: number
  }>()
})

test('codec: hydrate receives the dehydrate return value and the lifecycle ctx', () => {
  const rootRoute = createRootRouteWithContext<{ user: string; q: number }>()({
    beforeLoad: ({ context }) => ({ rootBl: context.user }),
  })

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '$id',
    validateSearch: () => ({ page: 1 }),
    context: {
      handler: ({ params }) => ({ c: params.id, cFn: () => 5 }),
      dehydrate: ({ data, params }) => {
        expectTypeOf(data).toEqualTypeOf<{ c: string; cFn: () => number }>()
        return { c: data.c + params.id }
      },
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ c: string }>()
        return { c: data.c, cFn: () => context.q }
      },
    },
    beforeLoad: {
      handler: ({ search, context }) => ({
        page: search.page + context.q,
        bFn: () => context.cFn(),
      }),
      dehydrate: ({ data }) => ({ page: data.page }),
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ page: number }>()
        return { page: data.page + context.q, bFn: () => context.cFn() }
      },
    },
    loader: {
      // a real async handler: `() => Promise.resolve({...})` would keep the nested
      // `() => 1` literal (a Promise.resolve inference artifact, also on main)
      handler: async ({ params }) => ({
        id: await Promise.resolve(params.id),
        when: new Date(),
        // not annotated: the literal return must widen to `number` (asserted below)
        fn: () => 1,
      }),
      dehydrate: ({ data, location }) => {
        expectTypeOf(data).toEqualTypeOf<{
          id: string
          when: Date
          fn: () => number
        }>()
        return {
          id: data.id,
          iso: data.when.toISOString(),
          path: location.pathname,
        }
      },
      hydrate: ({ data, context, params }) => {
        expectTypeOf(data).toEqualTypeOf<{
          id: string
          iso: string
          path: string
        }>()
        return {
          id: data.id + params.id,
          when: new Date(data.iso),
          fn: () => context.page,
        }
      },
      staleReloadMode: 'background',
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
    fn: () => number
  }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    c: string
    cFn: () => number
    page: number
    bFn: () => number
  }>()
})

test('codec: the wire is not validated in a plain SPA register', () => {
  const rootRoute = createRootRoute()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'unchecked',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => ({ id: data.id, g: () => 2 }),
      hydrate: ({ data }) => ({ id: data.id, when: new Date() }),
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
})

test('codec: a dehydrate function without hydrate is rejected', () => {
  const rootRoute = createRootRoute()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'unpaired',
    // @ts-expect-error a dehydrate function requires hydrate
    context: {
      handler: () => ({ c: 1 }),
      dehydrate: ({ data }) => ({ c: data.c }),
    },
    // @ts-expect-error a dehydrate function requires hydrate
    beforeLoad: {
      handler: () => ({ b: 1 }),
      dehydrate: ({ data }) => ({ b: data.b }),
    },
    // @ts-expect-error a dehydrate function requires hydrate
    loader: {
      handler: () => Promise.resolve({ id: 's' }),
      dehydrate: ({ data }) => ({ id: data.id }),
    },
  })
})

test('codec: key order is handler, dehydrate, hydrate', () => {
  const rootRoute = createRootRoute()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrate-first',
    // @ts-expect-error hydrate written before dehydrate: the wire is inferred from dehydrate
    loader: {
      handler: (): Report => ({ id: 's', when: new Date(), format: String }),
      hydrate: ({ data }) => ({
        id: data.id,
        when: new Date(),
        format: String,
      }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
    },
  })

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'handler-last/$id',
    // @ts-expect-error handler written after the codec halves
    loader: {
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => ({ id: data.id, when: new Date(data.iso) }),
      handler: ({ params }) =>
        Promise.resolve({ id: params.id, when: new Date() }),
    },
  })
})

// ---------------------------------------------------------------------------
// revalidate (context only)
// ---------------------------------------------------------------------------

test('revalidate: true, a function with typed prev, and an async function', () => {
  const rootRoute = createRootRoute()

  const flag = createRoute({
    getParentRoute: () => rootRoute,
    path: 'flag',
    context: { handler: () => ({ a: 1 }), revalidate: true },
  })
  const fn = createRoute({
    getParentRoute: () => rootRoute,
    path: 'fn/$id',
    context: {
      handler: ({ params }) => ({ id: params.id, n: 0 }),
      revalidate: ({ prev, params }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { id: string; n: number } | undefined
        >()
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        return { id: prev?.id ?? params.id, n: (prev?.n ?? 0) + 1 }
      },
    },
  })
  const asyncFn = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async',
    context: {
      // `keep` is not annotated: `prev` must show the widened `() => number`
      handler: async () => ({ a: await Promise.resolve(1), keep: () => 1 }),
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { a: number; keep: () => number } | undefined
        >()
        return Promise.resolve({
          a: (prev?.a ?? 0) + 1,
          keep: prev?.keep ?? (() => 2),
        })
      },
    },
  })
  const withCodec = createRoute({
    getParentRoute: () => rootRoute,
    path: 'codec',
    context: {
      handler: async () => ({
        session: await Promise.resolve('s'),
        fn: () => 1,
      }),
      dehydrate: ({ data }) => ({ session: data.session }),
      hydrate: ({ data }) => ({ session: data.session, fn: () => 1 }),
      revalidate: ({ prev }) => ({ session: prev?.session ?? '', fn: () => 2 }),
    },
  })

  expectTypeOf(flag.types.routeContext).toEqualTypeOf<{ a: number }>()
  expectTypeOf(fn.types.routeContext).toEqualTypeOf<{
    id: string
    n: number
  }>()
  expectTypeOf(asyncFn.types.routeContext).toEqualTypeOf<{
    a: number
    keep: () => number
  }>()
  expectTypeOf(withCodec.types.routeContext).toEqualTypeOf<{
    session: string
    fn: () => number
  }>()
})

test('revalidate must return the handler data type', () => {
  const rootRoute = createRootRoute()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'bad',
    context: {
      handler: () => ({ id: 's', n: 0 }),
      // @ts-expect-error revalidate drops `n`
      revalidate: ({ prev }) => ({ id: prev?.id ?? 'x' }),
    },
  })
})

test('revalidate is rejected on beforeLoad and loader', () => {
  const rootRoute = createRootRoute()

  createRoute({
    getParentRoute: () => rootRoute,
    path: 'bad',
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

// ---------------------------------------------------------------------------
// async handlers
// ---------------------------------------------------------------------------

test('async handlers are awaited in routeContext, loaderData and the child ctx', () => {
  const rootRoute = createRootRouteWithContext<{ q: number }>()({
    context: {
      handler: ({ context }) =>
        Promise.resolve({ rootCtx: context.q + 1, when: new Date() }),
      dehydrate: ({ data }) => ({
        rootCtx: data.rootCtx,
        iso: data.when.toISOString(),
      }),
      hydrate: ({ data }) => ({
        rootCtx: data.rootCtx,
        when: new Date(data.iso),
      }),
      revalidate: ({ prev }) => ({
        rootCtx: (prev?.rootCtx ?? 0) + 1,
        when: new Date(),
      }),
    },
  })

  const parent = createRoute({
    getParentRoute: () => rootRoute,
    path: 'parent',
    context: ({ context }) =>
      Promise.resolve({ c: context.rootCtx + context.when.getTime() }),
    beforeLoad: {
      handler: ({ context }) => Promise.resolve({ b: context.c + 1 }),
    },
    loader: ({ context }) => Promise.resolve({ l: context.b }),
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    beforeLoad: ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<{
        q: number
        rootCtx: number
        when: Date
        c: number
        b: number
      }>()
      return {}
    },
  })

  expectTypeOf<Expand<typeof parent.types.routeContext>>().toEqualTypeOf<{
    c: number
    b: number
  }>()
  expectTypeOf(parent.types.loaderData).toEqualTypeOf<{ l: number }>()
  expectTypeOf<Expand<typeof child.types.allContext>>().toEqualTypeOf<{
    q: number
    rootCtx: number
    when: Date
    c: number
    b: number
  }>()
  expectTypeOf(child).toMatchTypeOf<AnyRoute>()
})

// ---------------------------------------------------------------------------
// unions
// ---------------------------------------------------------------------------

test('union handler results and union wires keep their members', () => {
  const rootRoute = createRootRoute()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '$id',
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
        // object literals in a conditional are normalized with `?: undefined` members
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
  const annotated = createRoute({
    getParentRoute: () => rootRoute,
    path: 'annotated',
    loader: {
      handler: (): { k: 'a'; a: number } | { k: 'b'; b: string } => ({
        k: 'a',
        a: 1,
      }),
      dehydrate: ({ data }): { t: 1; a: number } | { t: 2; b: string } =>
        data.k === 'a' ? { t: 1, a: data.a } : { t: 2, b: data.b },
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<
          { t: 1; a: number } | { t: 2; b: string }
        >()
        return data.t === 1
          ? { k: 'a' as const, a: data.a }
          : { k: 'b' as const, b: data.b }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<
    | { kind: 'a'; a: number; b?: undefined }
    | { kind: 'b'; b: string; a?: undefined }
  >()
  expectTypeOf(annotated.types.loaderData).toEqualTypeOf<
    { k: 'a'; a: number } | { k: 'b'; b: string }
  >()
})

// ---------------------------------------------------------------------------
// handlers and codec halves by reference
// ---------------------------------------------------------------------------

test('handlers passed by reference', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()({
    beforeLoad: ({ context }) => ({ rootBl: context.user }),
  })
  const loadReport = (ctx: { context: { rootBl: string } }): Report => ({
    id: ctx.context.rootBl,
    when: new Date(),
    format: (v) => `${v}`,
  })
  const loadPlain = (ctx: { params: { id: string } }) => ({
    id: ctx.params.id,
    when: new Date(),
  })
  const blByRef = (ctx: { context: { rootBl: string } }) => ({
    bRef: ctx.context.rootBl,
  })

  const fnForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'fn/$id',
    beforeLoad: blByRef,
    loader: loadPlain,
  })
  const objectForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'object',
    beforeLoad: { handler: blByRef },
    loader: {
      handler: loadReport,
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<Wire>()
        return {
          id: data.id + context.bRef,
          when: new Date(data.iso),
          format: (v: number) => `${v}`,
        }
      },
    },
  })

  expectTypeOf(fnForm.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
  expectTypeOf<Expand<typeof fnForm.types.routeContext>>().toEqualTypeOf<{
    bRef: string
  }>()
  expectTypeOf(objectForm.types.loaderData).toEqualTypeOf<Report>()
})

test('context-sensitive handler with inline, annotated and named codec halves', () => {
  const rootRoute = createRootRouteWithContext<{ q: number }>()({
    beforeLoad: ({ context }) => ({ root: context.q }),
  })
  const toWire = ({ data }: { data: Report }): Wire => ({
    id: data.id,
    iso: data.when.toISOString(),
  })
  const fromWire = ({ data }: { data: Wire }): Report => ({
    id: data.id,
    when: new Date(data.iso),
    format: (v) => `${v}`,
  })
  const fetchReport = (ctx: { context: { root: number } }): Report => ({
    id: `${ctx.context.root}`,
    when: new Date(),
    format: (v) => `${v}`,
  })

  const inline = createRoute({
    getParentRoute: () => rootRoute,
    path: 'inline/$id',
    loader: {
      handler: ({ params, context }): Promise<Report> =>
        Promise.resolve({
          id: params.id + context.root,
          when: new Date(),
          format: (v: number) => `${v}`,
        }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data, context }) => ({
        id: data.id + context.root,
        when: new Date(data.iso),
        format: (v: number) => `${v}`,
      }),
    },
  })
  const annotatedHydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'annotated/$id',
    loader: {
      handler: ({ params }): Report => ({
        id: params.id,
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
    path: 'named/$id',
    loader: {
      handler: ({ params }): Report => ({
        id: params.id,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: toWire,
      hydrate: fromWire,
    },
  })
  const namedDehydrate = createRoute({
    getParentRoute: () => rootRoute,
    path: 'named-dehydrate/$id',
    loader: {
      handler: ({ params }): Report => ({
        id: params.id,
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
    path: 'named-hydrate/$id',
    loader: {
      handler: ({ params }): Report => ({
        id: params.id,
        when: new Date(),
        format: (v) => `${v}`,
      }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: fromWire,
    },
  })
  const allNamed = createRoute({
    getParentRoute: () => rootRoute,
    path: 'all-named',
    loader: { handler: fetchReport, dehydrate: toWire, hydrate: fromWire },
  })
  const namedHandlerInlineCodec = createRoute({
    getParentRoute: () => rootRoute,
    path: 'named-handler',
    loader: {
      handler: fetchReport,
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
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
  const contextCodec = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context/$id',
    context: {
      handler: ({ params, context }) => ({
        key: params.id + context.q,
        fn: () => 1,
      }),
      dehydrate: ({ data }) => ({ key: data.key }),
      hydrate: ({ data }) => ({ key: data.key, fn: () => 1 }),
      revalidate: ({ prev, params }) => ({
        key: prev?.key ?? params.id,
        fn: () => 2,
      }),
    },
    beforeLoad: ({ context }) => ({ seen: context.key.length + context.fn() }),
  })

  expectTypeOf(inline.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(annotatedHydrate.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(named.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(namedDehydrate.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(namedHydrate.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(allNamed.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf(namedHandlerInlineCodec.types.loaderData).toEqualTypeOf<Report>()
  expectTypeOf<Expand<typeof contextCodec.types.routeContext>>().toEqualTypeOf<{
    key: string
    fn: () => number
    seen: number
  }>()
  expectTypeOf(contextCodec).toMatchTypeOf<AnyRoute>()
})

// ---------------------------------------------------------------------------
// always-throw handlers
// ---------------------------------------------------------------------------

test('sync always-throw handlers keep the route assignable to AnyRoute', () => {
  const rootRoute = createRootRoute()

  const fnForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'fn',
    beforeLoad: () => {
      throw redirect({ to: '/' })
    },
    loader: () => {
      throw notFound()
    },
  })
  const objectForm = createRoute({
    getParentRoute: () => rootRoute,
    path: 'object',
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

  const routeTree = rootRoute.addChildren([fnForm, objectForm])
  const router = createRouter({ routeTree })
  expectTypeOf(router.routeTree).toMatchTypeOf<AnyRoute>()
})

// ---------------------------------------------------------------------------
// typos and misplaced keys
// ---------------------------------------------------------------------------

test('typo keys and misplaced keys are rejected', () => {
  const rootRoute = createRootRoute()

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
      staleReloadMod: 'blocking',
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'handle',
    // @ts-expect-error `handle` is not `handler`
    loader: { handle: () => ({ l: 1 }) },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'hydrat',
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: ({ data }) => ({ id: data.id }),
      // @ts-expect-error typo next to a dehydrate function
      hydrat: ({ data }: { data: { id: string } }) => data,
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'malformed',
    // @ts-expect-error handler is required
    beforeLoad: { dehydrate: false },
    // @ts-expect-error handler must be a function
    loader: { handler: 'nope' },
  })
})

// ---------------------------------------------------------------------------
// boolean dehydrate
// ---------------------------------------------------------------------------

test('a boolean-typed dehydrate compiles in a plain SPA register', () => {
  const rootRoute = createRootRoute()
  const flag = Math.random() > 0.5

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'flag',
    context: { handler: () => ({ c: 1, cFn: () => 1 }), dehydrate: flag },
    loader: { handler: () => ({ l: 1, lFn: () => 1 }), dehydrate: flag },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    l: number
    lFn: () => number
  }>()
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    c: number
    cFn: () => number
  }>()
})

// ---------------------------------------------------------------------------
// literal widening
// ---------------------------------------------------------------------------

test('nested literal returns are widened like the function form', () => {
  const rootRoute = createRootRoute()

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

  expectTypeOf<
    Expand<typeof route.types.routeContext>
  >().toEqualTypeOf<string>()
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ kind: 'a'; n: number }>()
})

// ---------------------------------------------------------------------------
// parent object forms visible in children
// ---------------------------------------------------------------------------

test('object-form context and beforeLoad of a parent are visible in the child', () => {
  const rootRoute = createRootRouteWithContext<{ q: number }>()()

  const parent = createRoute({
    getParentRoute: () => rootRoute,
    path: 'parent',
    context: { handler: () => ({ pc: 1 }), revalidate: true },
    beforeLoad: {
      handler: () => Promise.resolve({ pb: 'b' }),
      dehydrate: true,
    },
  })
  const child = createRoute({
    getParentRoute: () => parent,
    path: 'child',
    context: ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<{
        q: number
        pc: number
        pb: string
      }>()
      return { cc: context.pc + 1 }
    },
    beforeLoad: ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<{
        q: number
        pc: number
        pb: string
        cc: number
      }>()
      return { cb: context.pb + context.cc }
    },
    loader: ({ context }) => {
      expectTypeOf(context).toEqualTypeOf<{
        q: number
        pc: number
        pb: string
        cc: number
        cb: string
      }>()
      return { l: context.cb }
    },
  })

  expectTypeOf<Expand<typeof child.types.allContext>>().toEqualTypeOf<{
    q: number
    pc: number
    pb: string
    cc: number
    cb: string
  }>()
  expectTypeOf(child).toMatchTypeOf<AnyRoute>()
})

// ---------------------------------------------------------------------------
// root routes and the deprecated class constructors
// ---------------------------------------------------------------------------

test('createRootRoute and createRootRouteWithContext thread the codec wire', () => {
  const bare = createRootRoute({
    loader: {
      handler: () => ({ a: 1 }),
      dehydrate: ({ data }) => ({ b: data.a }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ b: number }>()
        return { a: data.b }
      },
    },
  })
  const withContext = createRootRouteWithContext<{ q: number }>()({
    context: {
      handler: ({ context }) =>
        Promise.resolve({ rootCtx: context.q, when: new Date() }),
      dehydrate: ({ data }) => ({
        rootCtx: data.rootCtx,
        iso: data.when.toISOString(),
      }),
      hydrate: ({ data, context }) => {
        expectTypeOf(data).toEqualTypeOf<{ rootCtx: number; iso: string }>()
        return { rootCtx: data.rootCtx + context.q, when: new Date(data.iso) }
      },
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { rootCtx: number; when: Date } | undefined
        >()
        return { rootCtx: (prev?.rootCtx ?? 0) + 1, when: new Date() }
      },
    },
    loader: {
      handler: () => Promise.resolve({ rootLoad: 1 }),
      dehydrate: true,
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ rootLoad: number }>()
        return { rootLoad: data.rootLoad * 2 }
      },
    },
  })

  expectTypeOf(bare.types.loaderData).toEqualTypeOf<{ a: number }>()
  expectTypeOf<Expand<typeof withContext.types.routeContext>>().toEqualTypeOf<{
    rootCtx: number
    when: Date
  }>()
  expectTypeOf(withContext.types.loaderData).toEqualTypeOf<{
    rootLoad: number
  }>()
})

test('the deprecated Route and RootRoute constructors accept the object form with an unchecked wire', () => {
  const rootRoute = new RootRoute({
    loader: {
      handler: () => ({ a: 1 }),
      dehydrate: ({ data }) => ({ b: data.a }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toBeAny()
        return { a: 1 }
      },
    },
  })
  const route = new Route({
    getParentRoute: () => rootRoute,
    path: 'legacy',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => ({ id: data.id, iso: data.when.toISOString() }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toBeAny()
        return { id: 's', when: new Date() }
      },
    },
  })

  expectTypeOf(rootRoute.types.loaderData).toEqualTypeOf<{ a: number }>()
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()
})

// ---------------------------------------------------------------------------
// method shorthand, void handlers, explicit undefined keys
// ---------------------------------------------------------------------------

test('method shorthand for handler, dehydrate and hydrate', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()({
    beforeLoad: ({ context }) => ({ rootBl: context.user }),
  })

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
})

test('void and undefined-returning handlers with and without hydrate', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()()

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
      expectTypeOf(context).toEqualTypeOf<{ user: string }>()
      return { seen: true }
    },
  })

  expectTypeOf(plain.types.loaderData).toEqualTypeOf<void>()
  expectTypeOf(withHydrate.types.loaderData).toEqualTypeOf<void>()
  expectTypeOf<Expand<typeof child.types.allContext>>().toEqualTypeOf<{
    user: string
    seen: boolean
  }>()
  expectTypeOf(child).toMatchTypeOf<AnyRoute>()
})

test('an explicit dehydrate: undefined types like an omitted key', () => {
  const rootRoute = createRootRoute()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'dehydrate-undefined',
    loader: {
      handler: () => ({ id: 's', fn: () => 1 }),
      dehydrate: undefined,
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    fn: () => number
  }>()
})

test('an explicit hydrate: undefined next to a dehydrate function is rejected', () => {
  const rootRoute = createRootRoute()

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
// shared codecs, generic handlers, any wires, parsed params
// ---------------------------------------------------------------------------

test('a shared codec object spread into the object form', () => {
  const rootRoute = createRootRouteWithContext<{ user: string }>()({
    beforeLoad: ({ context }) => ({ rootBl: context.user }),
  })
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
  const rootRoute = createRootRouteWithContext<{ user: string }>()({
    beforeLoad: ({ context }) => ({ rootBl: context.user }),
  })
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

test('an any-typed wire gives hydrate an any data', () => {
  const rootRoute = createRootRoute()

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

test('a dehydrate returning unknown is a wire of type unknown', () => {
  const rootRoute = createRootRoute()
  const encode = (value: unknown): unknown => JSON.stringify(value)

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'unknown-wire',
    loader: {
      handler: () => ({ id: 's', when: new Date() }),
      dehydrate: ({ data }) => encode(data),
      hydrate: ({ data }) => {
        expectTypeOf(data).toBeUnknown()
        return { id: String(data), when: new Date() }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    id: string
    when: Date
  }>()

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

test('parsed params and a non-destructured ctx inside the codec halves', () => {
  const rootRoute = createRootRoute()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: '$id',
    params: {
      parse: (raw) => ({ id: Number(raw.id) }),
      stringify: (p) => ({ id: String(p.id) }),
    },
    loader: {
      handler: ({ params }) => ({ n: params.id, when: new Date() }),
      dehydrate: ({ data, params }) => {
        expectTypeOf(params).toEqualTypeOf<{ id: number }>()
        return { n: data.n, iso: data.when.toISOString() }
      },
      hydrate: (ctx) => {
        expectTypeOf(ctx.data).toEqualTypeOf<{ n: number; iso: string }>()
        expectTypeOf(ctx.params).toEqualTypeOf<{ id: number }>()
        return { n: ctx.data.n, when: new Date(ctx.data.iso) }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{
    n: number
    when: Date
  }>()
})

// ---------------------------------------------------------------------------
// hydrate requires dehydrate (true or a function)
// ---------------------------------------------------------------------------

test('hydrate without a dehydrate key is rejected on all three lifecycles', () => {
  const rootRoute = createRootRoute()

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
  const rootRoute = createRootRoute()

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
  const rootRoute = createRootRoute()

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
  const rootRoute = createRootRoute()
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

test('an async wire holding a function compiles in a plain SPA register', () => {
  const rootRoute = createRootRoute()

  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'async-wire-fn',
    loader: {
      handler: () => ({ id: 's' }),
      dehydrate: ({ data }) =>
        Promise.resolve({ id: data.id, g: () => data.id.length }),
      hydrate: ({ data }) => {
        expectTypeOf(data).toEqualTypeOf<{ id: string; g: () => number }>()
        return { id: data.id }
      },
    },
  })

  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ id: string }>()
})

test('a hydrate returning the handler shape, a subtype of it, or the handler shape plus an extra property leaves the types unchanged', () => {
  const rootRoute = createRootRoute()
  const loadReport = (): Promise<Report> =>
    Promise.resolve({ id: 'r', when: new Date(), format: (v) => `${v}` })
  const flag = Math.random() > 0.5

  const plain = createRoute({
    getParentRoute: () => rootRoute,
    path: 'reduce-plain',
    loader: { handler: loadReport },
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
