import { expectTypeOf, test } from 'vitest'
import { createRouterConfig } from '@tanstack/router-core'
import {
  createFileRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  createSerializationAdapter,
  redirect,
  useLoaderData,
  useRouteContext,
} from '../../src'
import type { AnyRoute } from '../../src'
import type { Expand } from '@tanstack/router-core'

// The code examples of the lifecycle docs, compiled under a Start register
// (`Register.ssr: true`, a concrete `Register.router`, the adapters on
// `Register.config`) with the types the docs claim pinned next to them:
//
//   docs/start/framework/react/guide/ssr-data-transport.md
//   docs/start/framework/react/guide/serialization-adapters.md
//   docs/router/api/router/RouteOptionsType.md (lifecycle object form)
//   docs/router/guide/router-context.md (the route `context` option)
//   docs/router/guide/data-loading.md (loader object form)
//   docs/router/guide/ssr.md (what crosses the wire)
//
// Route paths are the docs' paths; where two examples share one path the second
// gets a suffix. Helpers the docs leave to the app (`fetchStats`, `readPrefs`,
// the `createIsomorphicFn` results, ...) are declared with the types the docs
// assume. The `Register` augmentation is global to a tsc program, so this folder
// is its own vitest project with its own tsconfig, like tests/start-register.
// Assertions on hook results live inside `select` so the file stays identical
// across react, solid and vue (vue's hooks return a Ref).

// ---------------------------------------------------------------------------
// app types and helpers the docs assume
// ---------------------------------------------------------------------------

type Session = { userId: string; roles: Array<string> }
type Auth = { getSession: () => Promise<Session | null> }
type QueryOptions<T> = { queryKey: Array<string>; queryFn: () => Promise<T> }
type QueryClient = {
  ensureQueryData: <T>(options: QueryOptions<T>) => Promise<T>
}
type Post = { id: string; title: string }
type Account = { plan: string }
type AuthStatus = 'guest' | 'member'
type Report = { rows: Array<number> }
type Stats = { views: number }
type Prefs = { theme: 'dark' | 'light' }
// holds a function: not serializable
type EditorSession = { id: string; dispose: () => void }
type Doc = { id: string; body: string }
type Todo = { id: string; done: boolean }

declare function postQueryOptions(postId: string): QueryOptions<Post>
declare function accountQueryOptions(): QueryOptions<Account>
declare function fetchPosts(): Promise<Array<Post>>
declare function fetchReport(): Promise<Report>
declare function fetchStats(): Promise<Stats>
declare function readPrefs(): Promise<Prefs>
declare function readPrefsFromLocalStorage(): Prefs
// the docs build this with createIsomorphicFn(): undefined on the server
declare function getLocalPrefs(): Prefs | undefined
declare function getAuthStatus(): Promise<AuthStatus>
declare function createEditorSession(): EditorSession
declare function fetchDocument(): Promise<Doc>
declare function compress(body: string): Promise<Uint8Array>
declare function decompress(body: Uint8Array): Promise<string>
declare function getSession(context: unknown): Promise<Session>
declare function fetchInvoiceTotal(id: string): Promise<Decimal>
declare function fetchTodosByUserId(userId: string): Promise<Array<Todo>>

// ---------------------------------------------------------------------------
// serialization-adapters.md: adapters
// ---------------------------------------------------------------------------

declare class Decimal {
  constructor(value: string)
  toString(): string
  plus(other: Decimal): Decimal
}
declare class Inner {
  constructor(value: number)
  value: number
  double(): number
}
declare class Outer {
  constructor(inner: Inner)
  inner: Inner
  unwrap(): Inner
}
// not registered anywhere
declare class Money {
  constructor(cents: number)
  cents: number
  format(): string
}

const decimalAdapter = createSerializationAdapter({
  key: 'decimal',
  test: (v): v is Decimal => v instanceof Decimal,
  toSerializable: (v) => v.toString(),
  fromSerializable: (s) => new Decimal(s),
})

const innerAdapter = createSerializationAdapter({
  key: 'inner',
  test: (v): v is Inner => v instanceof Inner,
  toSerializable: (inner) => inner.value,
  fromSerializable: (value) => new Inner(value),
})

const outerAdapter = createSerializationAdapter({
  key: 'outer',
  extends: [innerAdapter],
  test: (v): v is Outer => v instanceof Outer,
  toSerializable: (outer) => outer.inner, // an Inner, handled by innerAdapter
  fromSerializable: (inner) => new Outer(inner),
})

test('serialization-adapters: the adapter halves are typed from `test`', () => {
  expectTypeOf(decimalAdapter.toSerializable)
    .parameter(0)
    .toEqualTypeOf<Decimal>()
  expectTypeOf(decimalAdapter.toSerializable).returns.toEqualTypeOf<string>()
  expectTypeOf(decimalAdapter.fromSerializable)
    .parameter(0)
    .toEqualTypeOf<string>()
  expectTypeOf(decimalAdapter.fromSerializable).returns.toEqualTypeOf<Decimal>()
  expectTypeOf(outerAdapter.toSerializable).returns.toEqualTypeOf<Inner>()
  expectTypeOf(outerAdapter.fromSerializable)
    .parameter(0)
    .toEqualTypeOf<Inner>()
})

test('serialization-adapters: `toSerializable` is checked, `extends` widens what it may return', () => {
  createSerializationAdapter({
    key: 'outer-without-extends',
    test: (v): v is Outer => v instanceof Outer,
    // @ts-expect-error Inner is not serializable unless innerAdapter is listed in `extends`
    toSerializable: (outer) => outer.inner,
    fromSerializable: (inner: Inner) => new Outer(inner),
  })
  createSerializationAdapter({
    key: 'function-output',
    test: (v): v is Decimal => v instanceof Decimal,
    // @ts-expect-error a function is not serializable
    toSerializable: (v) => () => v.toString(),
    fromSerializable: (fn: () => string) => new Decimal(fn()),
  })
})

// The docs register the adapters on `createStart`; the generated routeTree.gen.ts
// then puts `Awaited<ReturnType<typeof startInstance.getOptions>>` on
// `Register.config`. This package cannot import @tanstack/react-start, so the
// config is built with router-core's `createRouterConfig`, which carries the same
// `'~types'.serializationAdapters` the serializability check reads.
const config = createRouterConfig({
  serializationAdapters: [decimalAdapter, outerAdapter],
})

// ---------------------------------------------------------------------------
// root route and register
// ---------------------------------------------------------------------------

type RootContext = {
  auth: Auth
  queryClient: QueryClient
  sessions: Map<string, Session>
  user: { id: string; name: string }
  foo: boolean
}

const rootRoute = createRootRouteWithContext<RootContext>()({})

declare module '@tanstack/router-core' {
  interface Register {
    ssr: true
    router: typeof router
    config: typeof config
  }
  interface FileRoutesByPath {
    '/editor': {
      id: '/editor'
      path: '/editor'
      fullPath: '/editor'
      preLoaderRoute: typeof editorRoute
      parentRoute: typeof rootRoute
    }
    '/_authed': {
      id: '/_authed'
      path: ''
      fullPath: '/'
      preLoaderRoute: typeof authedRoute
      parentRoute: typeof rootRoute
    }
    '/posts/$postId': {
      id: '/posts/$postId'
      path: '/posts/$postId'
      fullPath: '/posts/$postId'
      preLoaderRoute: typeof postsRoute
      parentRoute: typeof rootRoute
    }
    '/report': {
      id: '/report'
      path: '/report'
      fullPath: '/report'
      preLoaderRoute: typeof reportRoute
      parentRoute: typeof rootRoute
    }
    '/dashboard': {
      id: '/dashboard'
      path: '/dashboard'
      fullPath: '/dashboard'
      preLoaderRoute: typeof dashboardRoute
      parentRoute: typeof rootRoute
    }
    '/document': {
      id: '/document'
      path: '/document'
      fullPath: '/document'
      preLoaderRoute: typeof documentRoute
      parentRoute: typeof rootRoute
    }
    '/build/posts/$postId': {
      id: '/build/posts/$postId'
      path: '/build/posts/$postId'
      fullPath: '/build/posts/$postId'
      preLoaderRoute: typeof buildRoute
      parentRoute: typeof rootRoute
    }
    '/invoice/$id': {
      id: '/invoice/$id'
      path: '/invoice/$id'
      fullPath: '/invoice/$id'
      preLoaderRoute: typeof invoiceRoute
      parentRoute: typeof rootRoute
    }
    '/posts-ctx/$postId': {
      id: '/posts-ctx/$postId'
      path: '/posts-ctx/$postId'
      fullPath: '/posts-ctx/$postId'
      preLoaderRoute: typeof postsCtxRoute
      parentRoute: typeof rootRoute
    }
    '/account': {
      id: '/account'
      path: '/account'
      fullPath: '/account'
      preLoaderRoute: typeof accountRoute
      parentRoute: typeof rootRoute
    }
    '/todos': {
      id: '/todos'
      path: '/todos'
      fullPath: '/todos'
      preLoaderRoute: typeof todosRoute
      parentRoute: typeof rootRoute
    }
    '/posts': {
      id: '/posts'
      path: '/posts'
      fullPath: '/posts'
      preLoaderRoute: typeof postsListRoute
      parentRoute: typeof rootRoute
    }
  }
}

// ---------------------------------------------------------------------------
// ssr-data-transport.md
// ---------------------------------------------------------------------------

// "dehydrate: false": the server runs it, the client runs it again
const editorRoute = createFileRoute('/editor')({
  ssr: 'data-only',
  beforeLoad: {
    handler: () => ({ editorSession: createEditorSession() }),
    dehydrate: false,
  },
})

// "Sending a context: dehydrate: true" (also router-context.md's auth example)
const authedRoute = createFileRoute('/_authed')({
  context: {
    handler: async ({ context }) => ({
      session: await context.auth.getSession(),
    }),
    dehydrate: true, // send it; the result is serializability-checked
    revalidate: true, // re-run on router.invalidate() (login/logout)
  },
  beforeLoad: ({ context }) => {
    if (!context.session) throw redirect({ to: '/' })
  },
})

// "Custom dehydrate and hydrate": rebuild query options from a small wire value
const postsRoute = createFileRoute('/posts/$postId')({
  context: {
    handler: async ({ params }) => ({
      postId: params.postId,
      postQueryOptions: postQueryOptions(params.postId),
      authStatus: await getAuthStatus(),
    }),
    dehydrate: ({ data }) => ({
      postId: data.postId,
      authStatus: data.authStatus,
    }),
    hydrate: ({ data, context }) => {
      expectTypeOf(data).toEqualTypeOf<{
        postId: string
        authStatus: AuthStatus
      }>()
      expectTypeOf(context.queryClient).toEqualTypeOf<QueryClient>()
      return {
        postId: data.postId,
        postQueryOptions: postQueryOptions(data.postId), // may also use context.queryClient
        authStatus: data.authStatus,
      }
    },
  },
})

// The actual createIsomorphicFn builders for these examples are checked in the
// framework's Start-client lifecyclePhases integration matrix. Router-only tests
// use their inferred structural return types without depending on Start.
declare const reportHandler: {
  ():
    | Promise<{ report: Report }>
    | Promise<{ report: Report; timeZone: string }>
  readonly '~types': {
    server: Promise<{ report: Report }>
    client: Promise<{ report: Report; timeZone: string }>
  }
}
declare const dashboardHandler: {
  (): Promise<{ stats: Stats }> | Promise<{ stats: Stats; prefs: Prefs }>
  readonly '~types': {
    server: Promise<{ stats: Stats }>
    client: Promise<{ stats: Stats; prefs: Prefs }>
  }
}

const reportRoute = createFileRoute('/report')({
  ssr: 'data-only',
  loader: {
    handler: reportHandler,
    dehydrate: true,
    hydrate: ({ data }) => {
      expectTypeOf(data).toEqualTypeOf<{ report: Report }>()
      return {
        ...data,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }
    },
  },
})

const dashboardRoute = createFileRoute('/dashboard')({
  ssr: 'data-only',
  loader: {
    handler: dashboardHandler,
    dehydrate: ({ data }) => data.stats,
    hydrate: ({ data }) => ({
      stats: data,
      prefs: readPrefsFromLocalStorage(),
    }),
  },
})

// "Async dehydrate and hydrate"
const documentRoute = createFileRoute('/document')({
  loader: {
    handler: () => fetchDocument(),
    dehydrate: async ({ data }) => ({
      id: data.id,
      body: await compress(data.body),
    }),
    hydrate: async ({ data }) => {
      expectTypeOf(data).toEqualTypeOf<{ id: string; body: Uint8Array }>()
      return { id: data.id, body: await decompress(data.body) }
    },
  },
})

// "What the build removes": the source the compiler splits per bundle
const buildRoute = createFileRoute('/build/posts/$postId')({
  context: {
    handler: async ({ params, context }) => ({
      postId: params.postId,
      session: await getSession(context),
    }),
    dehydrate: ({ data }) => ({
      postId: data.postId,
      userId: data.session.userId,
    }),
    hydrate: ({ data, context }) => ({
      postId: data.postId,
      session: context.sessions.get(data.userId)!,
    }),
    revalidate: true,
  },
})

// ---------------------------------------------------------------------------
// serialization-adapters.md: "The type-level effect"
// ---------------------------------------------------------------------------

const invoiceRoute = createFileRoute('/invoice/$id')({
  loader: async ({ params }) => ({
    id: params.id,
    total: await fetchInvoiceTotal(params.id), // a Decimal: accepted, decimalAdapter is registered
  }),
})

// ---------------------------------------------------------------------------
// router-context.md: the route `context` option
// ---------------------------------------------------------------------------

// the common case: functions in the context, never sent, recomputed from params
const postsCtxRoute = createFileRoute('/posts-ctx/$postId')({
  context: ({ params }) => ({
    postQueryOptions: postQueryOptions(params.postId),
  }),
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(context.postQueryOptions),
})

// refresh one part of the context and keep the rest stable
const accountRoute = createFileRoute('/account')({
  context: {
    handler: async () => ({
      accountQueryOptions: accountQueryOptions(),
      authStatus: await getAuthStatus(),
    }),
    dehydrate: false,
    revalidate: async ({ prev }) => {
      expectTypeOf(prev).toEqualTypeOf<
        | { accountQueryOptions: QueryOptions<Account>; authStatus: AuthStatus }
        | undefined
      >()
      return {
        accountQueryOptions: prev?.accountQueryOptions ?? accountQueryOptions(),
        authStatus: await getAuthStatus(),
      }
    },
  },
})

// "Modifying the Router Context" and "Using the Router Context"
const todosRoute = createFileRoute('/todos')({
  beforeLoad: () => {
    return {
      bar: true,
    }
  },
  loader: ({ context }) => {
    expectTypeOf(context.foo).toEqualTypeOf<boolean>()
    expectTypeOf(context.bar).toEqualTypeOf<boolean>()
    return fetchTodosByUserId(context.user.id)
  },
})

// ---------------------------------------------------------------------------
// data-loading.md: loader object form
// ---------------------------------------------------------------------------

const postsListRoute = createFileRoute('/posts')({
  loader: {
    handler: () => fetchPosts(),
    staleReloadMode: 'blocking',
  },
})

// ---------------------------------------------------------------------------
// hook results (the `Route.useLoaderData()` / `useRouteContext()` comments in
// the docs)
// ---------------------------------------------------------------------------

function useDocsExampleTypes() {
  return [
    editorRoute.useRouteContext({
      select: (context) => {
        expectTypeOf<Expand<typeof context>>().toEqualTypeOf<
          Expand<RootContext & { editorSession: EditorSession }>
        >()
        return context.editorSession.id
      },
    }),
    authedRoute.useRouteContext({
      select: (context) => {
        expectTypeOf(context.session).toEqualTypeOf<Session | null>()
        return context.session?.userId
      },
    }),
    postsRoute.useRouteContext({
      select: (context) => {
        expectTypeOf(context.postId).toEqualTypeOf<string>()
        expectTypeOf(context.postQueryOptions).toEqualTypeOf<
          QueryOptions<Post>
        >()
        expectTypeOf(context.authStatus).toEqualTypeOf<AuthStatus>()
        return context.postId
      },
    }),
    reportRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<{
          report: Report
          timeZone: string
        }>()
        return data.timeZone
      },
    }),
    dashboardRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<{
          stats: Stats
          prefs: Prefs
        }>()
        return data.prefs.theme
      },
    }),
    documentRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<Doc>()
        return data.body
      },
    }),
    buildRoute.useRouteContext({
      select: (context) => {
        expectTypeOf(context.session).toEqualTypeOf<Session>()
        return context.postId
      },
    }),
    invoiceRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<{ id: string; total: Decimal }>()
        return data.total.toString()
      },
    }),
    postsCtxRoute.useRouteContext({
      select: (context) => {
        expectTypeOf(context.postQueryOptions).toEqualTypeOf<
          QueryOptions<Post>
        >()
        return context.postQueryOptions.queryKey
      },
    }),
    postsCtxRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<Post>()
        return data.title
      },
    }),
    accountRoute.useRouteContext({
      select: (context) => {
        expectTypeOf(context.accountQueryOptions).toEqualTypeOf<
          QueryOptions<Account>
        >()
        expectTypeOf(context.authStatus).toEqualTypeOf<AuthStatus>()
        return context.authStatus
      },
    }),
    todosRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<Array<Todo>>()
        return data.length
      },
    }),
    postsListRoute.useLoaderData({
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<Array<Post>>()
        return data.length
      },
    }),
    useLoaderData({
      from: '/report',
      select: (data) => {
        expectTypeOf(data).toEqualTypeOf<{
          report: Report
          timeZone: string
        }>()
        return data.report.rows.length
      },
    }),
    useRouteContext({
      from: '/_authed',
      select: (context) => {
        expectTypeOf(context.session).toEqualTypeOf<Session | null>()
        return context.session
      },
    }),
  ]
}

test('ssr-data-transport: a sent result has to be serializable; dehydrate: false lifts the check', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'editor-sent',
    // @ts-expect-error the editor session holds a function and would be sent
    beforeLoad: { handler: () => ({ editorSession: createEditorSession() }) },
    // @ts-expect-error same for the function form
    loader: () => ({ editorSession: createEditorSession() }),
  })
  const kept = createRoute({
    getParentRoute: () => rootRoute,
    path: 'editor-kept',
    ssr: 'data-only',
    beforeLoad: {
      handler: () => ({ editorSession: createEditorSession() }),
      dehydrate: false,
    },
    loader: {
      handler: () => ({ editorSession: createEditorSession() }),
      dehydrate: false,
    },
  })
  expectTypeOf(kept.types.loaderData).toEqualTypeOf<{
    editorSession: EditorSession
  }>()
})

test('ssr-data-transport: a context with dehydrate: true is checked, a plain context is not', () => {
  const plain = createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-plain',
    context: ({ params }) => ({ fn: () => params }),
  })
  expectTypeOf(plain.types.routeContext).toEqualTypeOf<{
    fn: () => {}
  }>()
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'context-sent',
    // @ts-expect-error a sent context result must be serializable
    context: { handler: () => ({ fn: () => 1 }), dehydrate: true },
  })
})

test('ssr-data-transport: reconstruct from the full value, the hydrate result reduces to the handler data', () => {
  // a property that only hydrate adds is not visible on the data type
  const extra = createRoute({
    getParentRoute: () => rootRoute,
    path: 'report-extra',
    loader: {
      handler: async () => ({ report: await fetchReport() }),
      dehydrate: true,
      hydrate: ({ data }) => ({
        ...data,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    },
  })
  expectTypeOf(extra.types.loaderData).toEqualTypeOf<{ report: Report }>()
  expectTypeOf(extra.types.loaderData).not.toHaveProperty('timeZone')

  // the client-only field is part of the handler's result, so with
  // `dehydrate: true` it is serializability-checked like the rest
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'report-bad-field',
    // @ts-expect-error the declared client-only field holds a function
    loader: {
      handler: async () => ({
        report: await fetchReport(),
        formatter: undefined as ((v: number) => string) | undefined,
      }),
      dehydrate: true,
      hydrate: ({ data }) => ({ ...data, formatter: (v: number) => `${v}` }),
    },
  })

  // `dehydrate: true` is required next to `hydrate`
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'report-no-dehydrate',
    // @ts-expect-error hydrate requires dehydrate: true or a dehydrate function
    loader: {
      handler: async () => ({
        report: await fetchReport(),
        timeZone: undefined as string | undefined,
      }),
      hydrate: ({ data }) => ({ ...data, timeZone: 'UTC' }),
    },
  })
})

test('ssr-data-transport: the rules', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-handler-required',
    // @ts-expect-error the object form requires handler
    loader: { dehydrate: false },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-key-homes',
    context: {
      handler: () => ({ c: 1 }),
      // @ts-expect-error staleReloadMode exists on loader only
      staleReloadMode: 'blocking',
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
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-dehydrate-needs-hydrate',
    // @ts-expect-error a dehydrate function requires hydrate
    loader: {
      handler: () => ({ l: 1, when: new Date() }),
      dehydrate: ({ data }) => ({ l: data.l }),
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-hydrate-needs-dehydrate',
    // @ts-expect-error hydrate requires dehydrate: true or a dehydrate function
    beforeLoad: {
      handler: () => ({ b: 1 }),
      hydrate: ({ data }) => data,
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
    path: 'rules-order',
    // @ts-expect-error hydrate is written before dehydrate: `data` cannot be inferred
    loader: {
      handler: () => ({ l: 1, when: new Date() }),
      hydrate: ({ data }) => ({ l: data.l, when: new Date() }),
      dehydrate: ({ data }) => ({ l: data.l, iso: data.when.toISOString() }),
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-order-handler-last/$id',
    // @ts-expect-error handler is written after the codec halves: the parameters of the halves are inferred from it
    loader: {
      dehydrate: ({ data }) => ({ l: data.l, iso: data.when.toISOString() }),
      hydrate: ({ data }) => ({ l: data.l, when: new Date(data.iso) }),
      handler: ({ params }) => ({ l: params.id.length, when: new Date() }),
    },
  })
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-excess-key',
    loader: {
      handler: () => ({ l: 1 }),
      // @ts-expect-error unknown key
      staleReloadMod: 'blocking',
    },
  })
  // a wire value relying on a registered adapter is fine; one holding an
  // unregistered class is not
  const composed = createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-wire',
    loader: {
      handler: () => ({ total: new Decimal('1'), money: new Money(1) }),
      dehydrate: ({ data }) => ({ total: data.total }),
      hydrate: ({ data }) => ({ total: data.total, money: new Money(1) }),
    },
  })
  expectTypeOf(composed.types.loaderData).toEqualTypeOf<{
    total: Decimal
    money: Money
  }>()
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'rules-wire-bad',
    // @ts-expect-error Money is not registered: the wire is not serializable
    loader: {
      handler: () => ({ money: new Money(1) }),
      dehydrate: ({ data }) => ({ money: data.money }),
      hydrate: ({ data }) => data,
    },
  })
})

// ---------------------------------------------------------------------------
// serialization-adapters.md: the claims next to the examples
// ---------------------------------------------------------------------------

test('serialization-adapters: a registered type passes the check, an unregistered one is reported at its property', () => {
  expectTypeOf(config.serializationAdapters[0]).toEqualTypeOf(decimalAdapter)
  expectTypeOf(config.serializationAdapters[1]).toEqualTypeOf(outerAdapter)
  expectTypeOf(invoiceRoute.types.loaderData).toEqualTypeOf<{
    id: string
    total: Decimal
  }>()
  const nested = createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoice-nested',
    loader: () => ({
      lines: [{ total: new Decimal('1'), box: new Outer(new Inner(1)) }],
      byId: new Map([['a', new Decimal('2')]]),
    }),
  })
  expectTypeOf(nested.types.loaderData).toEqualTypeOf<{
    lines: Array<{ total: Decimal; box: Outer }>
    byId: Map<string, Decimal>
  }>()
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'invoice-bad',
    // @ts-expect-error Money has no adapter: the loader result is not serializable
    loader: () => ({ total: new Money(1999) }),
  })
})

// ---------------------------------------------------------------------------
// RouteOptionsType.md: the object forms with every key, and the bullets
// ---------------------------------------------------------------------------

test('RouteOptionsType: context, beforeLoad and loader object forms with every key', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'reference/$id',
    validateSearch: () => ({ page: 0 }),
    loaderDeps: ({ search }) => ({ page: search.page }),
    context: {
      handler: async ({ context, params, deps }) => {
        expectTypeOf(params).toEqualTypeOf<{ id: string }>()
        expectTypeOf(deps).toEqualTypeOf<{ page: number }>()
        return { session: await context.auth.getSession(), id: params.id }
      },
      dehydrate: ({ data }) => ({
        userId: data.session?.userId ?? null,
        id: data.id,
      }),
      hydrate: ({ data, context }) => ({
        session: data.userId
          ? (context.sessions.get(data.userId) ?? null)
          : null,
        id: data.id,
      }),
      revalidate: ({ prev }) => {
        expectTypeOf(prev).toEqualTypeOf<
          { session: Session | null; id: string } | undefined
        >()
        return { session: prev?.session ?? null, id: prev?.id ?? '' }
      },
    },
    beforeLoad: {
      handler: ({ context, search }) => ({
        label: `${context.id}-${search.page}`,
        at: new Date(),
      }),
      dehydrate: ({ data }) => ({
        label: data.label,
        iso: data.at.toISOString(),
      }),
      hydrate: ({ data }) => ({ label: data.label, at: new Date(data.iso) }),
    },
    loader: {
      handler: ({ context, deps }) => ({
        items: [context.label, String(deps.page)],
      }),
      dehydrate: true,
      hydrate: ({ data }) => data,
      staleReloadMode: 'blocking',
    },
  })
  // routeContext is the route's own contribution: context plus beforeLoad
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    session: Session | null
    id: string
    label: string
    at: Date
  }>()
  expectTypeOf(route.types.loaderData).toEqualTypeOf<{ items: Array<string> }>()
  expectTypeOf(route).toMatchTypeOf<AnyRoute>()
})

test('RouteOptionsType: revalidate must return the handler shape; staleReloadMode is one of two literals', () => {
  createRoute({
    getParentRoute: () => rootRoute,
    path: 'reference-bad',
    context: {
      handler: () => ({ id: 's', n: 0 }),
      // @ts-expect-error revalidate drops `n`
      revalidate: ({ prev }) => ({ id: prev?.id ?? 'x' }),
    },
    loader: {
      handler: () => fetchPosts(),
      // @ts-expect-error 'background' | 'blocking'
      staleReloadMode: 'sometimes',
    },
  })
})

// ---------------------------------------------------------------------------
// router-context.md and data-loading.md: the claims next to the examples
// ---------------------------------------------------------------------------

test('router-context: the route context option', () => {
  expectTypeOf(postsCtxRoute.types.routeContext).toEqualTypeOf<{
    postQueryOptions: QueryOptions<Post>
  }>()
  expectTypeOf(postsCtxRoute.types.loaderData).toEqualTypeOf<Post>()
  expectTypeOf(accountRoute.types.routeContext).toEqualTypeOf<{
    accountQueryOptions: QueryOptions<Account>
    authStatus: AuthStatus
  }>()
  expectTypeOf<Expand<typeof todosRoute.types.routeContext>>().toEqualTypeOf<{
    bar: boolean
  }>()
  expectTypeOf(todosRoute.types.loaderData).toEqualTypeOf<Array<Todo>>()
})

test('data-loading: the two loader forms type the same', () => {
  const fn = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts-fn',
    loader: () => fetchPosts(),
  })
  const object = createRoute({
    getParentRoute: () => rootRoute,
    path: 'posts-object',
    loader: {
      handler: () => fetchPosts(),
    },
  })
  expectTypeOf(fn.types.loaderData).toEqualTypeOf<Array<Post>>()
  expectTypeOf(object.types.loaderData).toEqualTypeOf<Array<Post>>()
  expectTypeOf(postsListRoute.types.loaderData).toEqualTypeOf<Array<Post>>()
})

test('ssr.md: what crosses the wire', () => {
  const route = createRoute({
    getParentRoute: () => rootRoute,
    path: 'ssr-authed',
    ssr: 'data-only', // lifecycles run on the server, the component renders on the client only
    context: {
      handler: async ({ context }) => ({
        session: await context.auth.getSession(),
      }),
      dehydrate: true, // context is not sent by default; send this one
    },
    beforeLoad: {
      handler: () => ({ editorSession: createEditorSession() }),
      dehydrate: false, // beforeLoad is sent by default; keep this one on the server
    },
  })
  expectTypeOf<Expand<typeof route.types.routeContext>>().toEqualTypeOf<{
    session: Session | null
    editorSession: EditorSession
  }>()
  expectTypeOf(route).toMatchTypeOf<AnyRoute>()
})

// ---------------------------------------------------------------------------
// tree + router (the registered router)
// ---------------------------------------------------------------------------

const routeTree = rootRoute.addChildren([
  editorRoute,
  authedRoute,
  postsRoute,
  reportRoute,
  dashboardRoute,
  documentRoute,
  buildRoute,
  invoiceRoute,
  postsCtxRoute,
  accountRoute,
  todosRoute,
  postsListRoute,
])

declare const rootContext: RootContext

export const router = createRouter({
  routeTree,
  context: rootContext,
})
